import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import vm from "node:vm"
import { PGlite } from "@electric-sql/pglite"

async function loadTS(file) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
}
const calc = await loadTS("lib/calculations/cycle-calculations.ts")
const symptoms = await loadTS("lib/symptoms/constants.ts")
const timeline = await loadTS("lib/notes/timeline.ts")
const cycle = start_date => ({ id: start_date, user_id: "owner", start_date, end_date: null, cycle_length: null, period_duration: null, notes: null, created_at: "", updated_at: "", period_days: [] })
assert.equal(calc.calculateCurrentCycleDay("2026-12-31", "2027-01-01"), 2)
assert.equal(calc.calculateCurrentCycleDay("2024-02-28", "2024-03-01"), 3)
assert.equal(calc.calculateCurrentCycleDay("2026-03-07", "2026-03-09"), 3)
assert.equal(calc.calculateCurrentCycleDay("2026-10-01", "2026-10-01"), 1)
assert.equal(calc.calculateAverageCycleLength([]), null)
assert.equal(calc.calculateAverageCycleLength([cycle("2026-01-01")]), null)
assert.equal(calc.calculateAverageCycleLength([cycle("2026-01-01"), cycle("2026-01-29")]), 28)
const history = ["2026-01-01", "2026-01-29", "2026-02-26", "2026-03-27", "2026-06-15"].map(cycle)
assert.equal(calc.calculateAverageCycleLength(history), 28)
assert.deepEqual(calc.getCompletedCycleLengths(history, "2026-06-16"), [28, 28, 29])
assert.equal(calc.calculateAverageCycleLength([cycle("2026-01-01"), cycle("2026-03-22")]), null)
const predicted = calc.calculateEstimatedNextPeriod({ latestCycleStartDate: "2026-06-15", averageCycleLength: 28, typicalCycleLength: 28, referenceDateStr: "2026-08-01", cycles: history })
assert.equal(predicted.estimatedStartDate, "2026-07-13")
assert.equal(predicted.windowEndDate, "2026-07-14")
assert.ok(predicted.daysUntil < 0)
assert.equal(calc.calculateCurrentCycleDay("2026-06-15", "2026-08-01"), 48)
assert.equal(calc.getRecordedCycleEnd(history.at(-1), history), null)
assert.equal(calc.getRecordedCycleEnd(history[0], history), "2026-01-28")
assert.equal(calc.calculateEstimatedNextPeriod({ latestCycleStartDate: null, averageCycleLength: null, typicalCycleLength: 28 }), null)
assert.equal(calc.calculateEstimatedNextPeriod({ latestCycleStartDate: "2026-01-01", averageCycleLength: null, typicalCycleLength: 28 }).isFallback, true)
assert.deepEqual(symptoms.getSymptomValues({ symptom: "Cramps" }), ["Cramps"])
assert.deepEqual(symptoms.getSymptomValues({ symptom: "Cramps", symptoms: ["Cramps", "Fatigue", "Cramps"] }), ["Cramps", "Fatigue"])
assert.equal(timeline.canEditNote({ user_id: "owner", author_id: "partner" }, "owner"), false)
assert.equal(timeline.canEditNote({ user_id: "owner", author_id: "owner", sent_at: "2026-10-01" }, "owner"), false)
assert.equal(timeline.canEditNote({ user_id: "owner", author_id: "owner", sent_at: null }, "owner"), true)
assert.equal(timeline.canEditNote({ user_id: "owner", author_id: "owner" }, "owner"), false)
assert.equal(timeline.getNoteAuthorLabel({ user_id: "owner", author_id: "former-partner" }, "owner", "new-partner", "New Partner"), "Original author · former-p")
assert.equal(timeline.getNoteAuthorLabel({ user_id: "owner", author_id: "new-partner" }, "owner", "new-partner", "New Partner"), "By New Partner")
console.log("PASS: calendar boundaries, robust historical predictions, extended cycles, legacy symptoms, note edit rules")

// Pre-migration client with an API row cap smaller than the requested batch size.
const legacyRows = Array.from({length:1205},(_,index)=>({ id:`large-${String(index).padStart(4,"0")}`,user_id:"owner",author_id:"owner",date:"2026-10-08",content:"legacy",created_at:"2026-10-08T00:00:00.000Z" }))
for(let day=1;day<=10;day++) legacyRows.push({id:`date-${day}`,user_id:"owner",author_id:"owner",date:`2026-09-${String(day).padStart(2,"0")}`,content:"older",created_at:"2026-10-08T00:00:00.000Z"})
legacyRows.push({id:"other-account",user_id:"other",author_id:"other",date:"2026-10-08",content:"private",created_at:"2026-10-08T00:00:00.000Z"})
let rpcError = {code:"PGRST202"}, legacyQueries = 0
const legacyClient = {
  rpc: async()=>({data:null,error:rpcError}),
  from() {
    const filters=[], orders=[];let first=0,last=999
    const query={
      select(){return query}, eq(key,value){filters.push(row=>row[key]===value);return query},
      lte(key,value){filters.push(row=>row[key]<=value);return query},
      lt(key,value){filters.push(row=>row[key]<value);return query},
      neq(key,value){filters.push(row=>row[key]!==value);return query},
      or(){filters.push(row=>!row.author_id||row.author_id==="owner");return query},
      in(key,values){filters.push(row=>values.includes(row[key]));return query},
      order(key,{ascending}){orders.push([key,ascending]);return query},
      limit(value){last=value-1;return query}, range(start,end){first=start;last=end;return query},
      then(resolve,reject){
        legacyQueries++
        const rows=legacyRows.filter(row=>filters.every(filter=>filter(row))).sort((a,b)=>{
          for(const [key,ascending] of orders){const comparison=a[key].localeCompare(b[key]);if(comparison)return ascending?comparison:-comparison}return 0
        }).slice(first,Math.min(last+1,first+200))
        return Promise.resolve({data:rows,error:null}).then(resolve,reject)
      },
    };return query
  },
}
const loaderExports={}
const loaderCode=ts.transpileModule(fs.readFileSync("lib/notes/server.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
vm.runInNewContext(loaderCode,{exports:loaderExports,console:{error(){}},require(name){
  if(name==="@/lib/supabase/server")return {createClient:async()=>legacyClient}
  if(name==="./timeline")return timeline
  throw new Error(`Unexpected legacy loader dependency ${name}`)
}})
const legacyPage=await loaderExports.loadNotesPage("owner","own",null,"2026-10-08T01:00:00.000Z")
assert.equal(timeline.groupNotesByDate(legacyPage.notes).length,8)
assert.equal(legacyPage.notes.filter(note=>note.date==="2026-10-08").length,1205)
const legacyNext=await loaderExports.loadNotesPage("owner","own",legacyPage.nextCursor,legacyPage.snapshot)
const legacyCombined=[...legacyPage.notes,...legacyNext.notes]
assert.equal(new Set(legacyCombined.map(note=>note.id)).size,1215)
assert.equal(legacyCombined.length,1215)
assert.ok(!legacyCombined.some(note=>note.user_id==="other"))
rpcError={code:"42501"};const queriesBeforeDenial=legacyQueries
await assert.rejects(loaderExports.loadNotesPage("owner","own"),/Unable to load notes/)
assert.equal(legacyQueries,queriesBeforeDenial)
console.log("PASS: missing-RPC compatibility, 1,205-note date group under API row caps, complete pagination, account isolation, permission errors never bypassed")

const db = new PGlite({ parsers: { 1082: value => value, 1184: value => new Date(value).toISOString() } })
try {
  // Isolated auth/partner fixture; initial owner policies come from the repository migration.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;`)
  await db.exec(fs.readFileSync("supabase/migrations/20260915000001_initial_schema.sql", "utf8").replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', ""))
  await db.exec(`ALTER TABLE public.daily_notes DROP CONSTRAINT unique_user_daily_note_date;
    ALTER TABLE public.daily_notes ADD COLUMN author_id uuid;
    CREATE TABLE public.partner_relationships(id uuid primary key, owner_user_id uuid, supporter_user_id uuid, status text);
    CREATE TABLE public.partner_sharing_preferences(relationship_id uuid primary key, daily_notes boolean, manage_daily_notes boolean);
    CREATE TABLE public.notification_preferences(user_id uuid primary key, partner_daily_notes boolean);
    CREATE TABLE public.notification_events(id uuid primary key default gen_random_uuid(), user_id uuid, cycle_id uuid, type text,
      scheduled_for date, title text, body text, url text, status text, metadata jsonb default '{}', sent_at timestamptz);
    CREATE UNIQUE INDEX idx_notification_events_dedup ON public.notification_events(user_id,type,scheduled_for,coalesce(cycle_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE status != 'cancelled';
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    CREATE POLICY "Supporters can view shared notes" ON public.daily_notes FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.partner_relationships r JOIN public.partner_sharing_preferences p ON p.relationship_id=r.id
        WHERE r.owner_user_id=daily_notes.user_id AND r.supporter_user_id=auth.uid() AND r.status='active' AND p.daily_notes));
    CREATE POLICY "Supporters can insert partner daily notes when authorized" ON public.daily_notes FOR INSERT TO authenticated WITH CHECK (
      EXISTS (SELECT 1 FROM public.partner_relationships r JOIN public.partner_sharing_preferences p ON p.relationship_id=r.id
        WHERE r.owner_user_id=daily_notes.user_id AND r.supporter_user_id=auth.uid() AND r.status='active' AND p.daily_notes AND p.manage_daily_notes));
    CREATE POLICY "Supporters can update partner daily notes when authorized" ON public.daily_notes FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY "Supporters can delete partner daily notes when authorized" ON public.daily_notes FOR DELETE TO authenticated USING(true);`)
  const owner = "11111111-1111-4111-8111-111111111111", partner = "22222222-2222-4222-8222-222222222222", stranger = "33333333-3333-4333-8333-333333333333"
  const relationship = "44444444-4444-4444-8444-444444444444"
  await db.query("INSERT INTO auth.users VALUES ($1),($2),($3)", [owner,partner,stranger])
  await db.query("INSERT INTO public.symptoms(user_id,date,symptom,severity) VALUES($1,'2026-10-01','Cramps','mild')",[owner])
  await db.query("INSERT INTO public.daily_notes(user_id,author_id,date,content) VALUES($1,$2,'2026-10-01','Legacy sent message')",[owner,partner])
  const migration = fs.readdirSync("supabase/migrations").find(name => name.endsWith("_phase22_cycle_notes_symptoms.sql"))
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`, "utf8"))
  assert.deepEqual((await db.query("SELECT symptoms FROM public.symptoms")).rows[0].symptoms,["Cramps"])
  assert.ok((await db.query("SELECT sent_at FROM public.daily_notes")).rows[0].sent_at)
  await db.query("INSERT INTO public.partner_relationships VALUES($1,$2,$3,'active')",[relationship,owner,partner])
  await db.query("INSERT INTO public.partner_sharing_preferences VALUES($1,true,true)",[relationship])
  async function as(user, fn) {
    await db.exec("SET ROLE authenticated")
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user])
    try { return await fn() } finally { await db.exec("RESET ROLE") }
  }
  const save = async (author, content, request = crypto.randomUUID(), date = "2026-10-08") => as(author, () => db.query("INSERT INTO public.daily_notes(user_id,author_id,date,content,request_id) VALUES($1,$2,$3,$4,$5) RETURNING *",[owner,author,date,content,request]))
  const first = (await save(owner,"Private message contents must stay out of push")).rows[0]
  const second = (await save(partner,"Reply")).rows[0]
  assert.equal(second.author_id, partner)
  const events = (await db.query("SELECT * FROM public.notification_events ORDER BY id")).rows
  assert.equal(events.length,2)
  for (const event of events) {
    assert.equal(event.title,"New note from your partner")
    assert.equal(event.body,"Your partner sent you a new note.")
    assert.ok(!JSON.stringify(event).includes(first.content))
    assert.equal(event.url,event.user_id===owner?"/notes?tab=partner":"/notes?view=partner")
  }
  for (const user of [owner,partner,stranger]) {
    const result = await as(user,()=>db.query("UPDATE public.daily_notes SET content='Tampered' WHERE id=$1 RETURNING id",[first.id]))
    assert.equal(result.rows.length,0)
  }
  await assert.rejects(db.query("UPDATE public.daily_notes SET content='Bypass attempt' WHERE id=$1",[first.id]),/immutable/)
  await assert.rejects(as(owner,()=>db.query("INSERT INTO public.daily_notes(user_id,author_id,date,content) VALUES($1,$2,'2026-10-08','Spoof')",[owner,partner])),/Invalid note author/)
  await assert.rejects(save(owner,"Retry",first.request_id),error=>error.code==="23505")
  assert.equal((await db.query("SELECT count(*)::int count FROM public.notification_events")).rows[0].count,2)
  await as(owner,()=>db.query("INSERT INTO public.symptoms(user_id,date,symptom,symptoms,severity) VALUES($1,'2026-10-08','Cramps',ARRAY['Cramps','Fatigue','Cramps'],'mild')",[owner]))
  assert.deepEqual((await db.query("SELECT symptoms FROM public.symptoms WHERE date='2026-10-08'")).rows[0].symptoms,["Cramps","Fatigue"])
  await assert.rejects(as(owner,()=>db.query("INSERT INTO public.symptoms(user_id,date,symptom,symptoms,severity) VALUES($1,'2026-10-08','Bad',ARRAY['Bad'],'mild')",[owner])),/Invalid symptoms/)
  await db.exec("SET ROLE service_role")
  assert.equal((await db.query("SELECT public.claim_note_notification($1) url",[events[0].id])).rows[0].url,events[0].url)
  assert.equal((await db.query("SELECT public.claim_note_notification($1) url",[events[0].id])).rows[0].url,null)
  await db.exec("RESET ROLE")
  await assert.rejects(as(owner,()=>db.query("SELECT public.claim_note_notification($1)",[events[1].id])),/permission denied/)
  await db.query("INSERT INTO public.notification_preferences VALUES($1,false)",[owner])
  await db.exec("SET ROLE service_role")
  const ownerEvent = events.find(event=>event.user_id===owner)
  assert.equal((await db.query("SELECT public.claim_note_notification($1) url",[ownerEvent.id])).rows[0].url,null)
  await db.exec("RESET ROLE")
  await save(partner,"Preference-disabled notification")
  assert.equal((await db.query("SELECT count(*)::int count FROM public.notification_events")).rows[0].count,2)
  // Exercise the real server dispatcher against the SQL claims; mock only push transport.
  const deliveredPayloads = []
  let transportFails = false, attempts = 0
  const admin = {
    from(table) {
      const conditions = [], parameters = []
      let deleting = false
      const builder = {
        select() { return builder },
        eq(column, value) { parameters.push(value); conditions.push(`${column}=$${parameters.length}`); return builder },
        is(column) { conditions.push(`${column} IS NULL`); return builder },
        contains(column, value) { parameters.push(JSON.stringify(value)); conditions.push(`${column} @> $${parameters.length}::jsonb`); return builder },
        limit() { return builder }, delete() { deleting = true; return builder },
        then(resolve, reject) {
          const result = table === "push_subscriptions"
            ? Promise.resolve({ data: deleting ? [] : [{ id: "test-subscription", endpoint: "https://example.com/push", p256dh: "test-key", auth: "test-auth" }] })
            : db.query(`SELECT id,user_id,metadata FROM public.notification_events WHERE ${conditions.join(" AND ")}`, parameters).then(result=>({ data: result.rows }))
          return result.then(resolve,reject)
        },
      }
      return builder
    },
    async rpc(_name, args) { return { data: (await db.query("SELECT public.claim_note_notification($1) url",[args.p_event_id])).rows[0].url } },
  }
  const dispatcherCode = ts.transpileModule(fs.readFileSync("lib/server/note-notifications.ts","utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const dispatcherExports = {}
  vm.runInNewContext(dispatcherCode, {
    exports: dispatcherExports,
    process: { env: { SUPABASE_SERVICE_ROLE_KEY: "test-only", NEXT_PUBLIC_SUPABASE_URL: "https://example.com" } },
    console: { error() {} },
    require(name) {
      if (name === "@supabase/supabase-js") return { createClient:()=>admin }
      if (name === "@/lib/server/web-push") return { sendWebPushNotification: async (_subscription,payload) => {
        attempts++
        if (transportFails) throw new Error("Simulated push failure")
        deliveredPayloads.push(payload)
        return { ok:true, statusCode:201 }
      } }
      throw new Error(`Unexpected dispatcher dependency ${name}`)
    },
  })
  const pushNote = (await save(owner,"Content never sent in push")).rows[0]
  await db.exec("SET ROLE service_role")
  await Promise.all([dispatcherExports.deliverNoteNotifications(pushNote.id),dispatcherExports.deliverNoteNotifications(pushNote.id)])
  assert.equal(deliveredPayloads.length,1)
  assert.equal(deliveredPayloads[0].data.url,"/notes?view=partner")
  assert.ok(!JSON.stringify(deliveredPayloads[0]).includes(pushNote.content))
  await db.exec("RESET ROLE")
  transportFails = true
  const failedPushNote = (await save(owner,"Save survives transport failure")).rows[0]
  await db.exec("SET ROLE service_role")
  await dispatcherExports.deliverNoteNotifications(failedPushNote.id)
  const failedAttempts = attempts
  await dispatcherExports.deliverNoteNotifications(failedPushNote.id)
  assert.equal(attempts,failedAttempts)
  await db.exec("RESET ROLE")
  assert.equal((await db.query("SELECT content FROM public.daily_notes WHERE id=$1",[failedPushNote.id])).rows[0].content,failedPushNote.content)
  // Even an outbox insertion failure leaves the note committed.
  await db.exec(`CREATE FUNCTION public.reject_test_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test delivery failure'; END $$;
    CREATE TRIGGER reject_test_event BEFORE INSERT ON public.notification_events FOR EACH ROW EXECUTE FUNCTION public.reject_test_event();`)
  const survives = (await save(owner,"Save survives event failure")).rows[0]
  assert.ok(survives.id)
  assert.equal((await db.query("SELECT count(*)::int count FROM public.notification_events WHERE metadata->>'noteId'=$1",[survives.id])).rows[0].count,0)
  await db.exec("DROP TRIGGER reject_test_event ON public.notification_events; DROP FUNCTION public.reject_test_event()")
  // Complete groups over more than one page, tied timestamps, and a concurrent new note.
  for(let day=1;day<=12;day++) for(let entry=0;entry<3;entry++) await save(owner,`Day ${day} entry ${entry}`,crypto.randomUUID(),`2026-09-${String(day).padStart(2,"0")}`)
  const snapshot = new Date().toISOString()
  const all = (await as(owner,()=>db.query("SELECT public.get_notes_date_page($1,'own',$2,null,9) notes",[owner,snapshot]))).rows[0].notes
  const groups = timeline.groupNotesByDate(all)
  assert.equal(groups.length,9)
  const visible = groups.slice(0,8), before = visible.at(-1).date
  const next = (await as(owner,()=>db.query("SELECT public.get_notes_date_page($1,'own',$2,$3,9) notes",[owner,snapshot,before]))).rows[0].notes
  const combined = [...visible.flatMap(group=>group.entries),...next]
  const expected = (await db.query("SELECT id FROM public.daily_notes WHERE user_id=$1 AND author_id=$1 AND created_at <= $2",[owner,snapshot])).rows
  assert.equal(combined.length,new Set(combined.map(note=>note.id)).size)
  assert.deepEqual(combined.map(note=>note.id).sort(),expected.map(note=>note.id).sort())
  assert.equal((await as(stranger,()=>db.query("SELECT public.get_notes_date_page($1,'all',$2,null,9) notes",[owner,snapshot]))).rows[0].notes.length,0)
  await db.query("UPDATE public.partner_sharing_preferences SET daily_notes=false")
  const count = (await db.query("SELECT count(*)::int count FROM public.notification_events")).rows[0].count
  await assert.rejects(save(partner,"Unauthorized creation"),/row-level security/)
  assert.equal((await db.query("SELECT count(*)::int count FROM public.notification_events")).rows[0].count,count)
  const unsent = (await save(owner,"Private editable note")).rows[0]
  assert.equal(unsent.sent_at,null)
  assert.equal((await as(owner,()=>db.query("UPDATE public.daily_notes SET content='Private revision' WHERE id=$1 RETURNING id",[unsent.id]))).rows.length,1)
  await db.query("UPDATE public.partner_sharing_preferences SET daily_notes=true")
  assert.ok((await db.query("SELECT sent_at FROM public.daily_notes WHERE id=$1",[unsent.id])).rows[0].sent_at)
  assert.equal((await as(owner,()=>db.query("UPDATE public.daily_notes SET content='Shared revision' WHERE id=$1 RETURNING id",[unsent.id]))).rows.length,0)
  assert.equal((await db.query("SELECT created_at FROM public.daily_notes WHERE id=$1",[unsent.id])).rows[0].created_at,unsent.created_at)
  console.log("PASS: actual PostgreSQL migration, RLS, immutable sent versions, author preservation, idempotency, privacy, notification claims/preferences, date-group pagination, legacy/multiple symptoms")
} finally { await db.close() }
