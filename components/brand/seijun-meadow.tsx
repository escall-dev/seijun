import * as React from "react"

export interface SeijunMeadowProps {
  className?: string
}

/**
 * Seijun Botanical Grass & Tulip Meadow Illustration
 *
 * A serene botanical illustration featuring organic grass blades and gentle
 * tulip silhouettes that harmonizes with Seijun's tulip brand identity.
 */
export function SeijunMeadow({ className }: SeijunMeadowProps = {}) {
  return (
    <div className={className ? `leading-none ${className}` : "w-full leading-none"} aria-hidden="true">
      <svg
        viewBox="0 0 400 110"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto block select-none pointer-events-none"
      >
        <defs>
          <linearGradient id="meadowGradBack" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.04" />
          </linearGradient>

          <linearGradient id="meadowGradMid" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.08" />
          </linearGradient>

          <linearGradient id="meadowGradFront" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.65" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.15" />
          </linearGradient>

          <linearGradient id="tulipBudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#b586ba" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* --- Background Rolling Hills --- */}
        <path
          d="M0 92 Q 70 78, 150 86 T 300 82 Q 355 84, 400 88 L 400 110 L 0 110 Z"
          fill="url(#meadowGradBack)"
        />
        <path
          d="M0 98 Q 90 90, 200 95 T 400 93 L 400 110 L 0 110 Z"
          fill="url(#meadowGradMid)"
        />

        {/* --- Back Layer Grass Blades --- */}
        <g fill="url(#meadowGradBack)">
          {/* Cluster Left */}
          <path d="M18 100 Q 15 72, 10 58 Q 16 70, 21 100 Z" />
          <path d="M28 100 Q 32 68, 38 52 Q 37 70, 31 100 Z" />
          <path d="M42 100 Q 40 75, 36 62 Q 43 74, 46 100 Z" />
          <path d="M60 100 Q 64 70, 72 56 Q 69 72, 63 100 Z" />
          <path d="M78 100 Q 75 74, 70 60 Q 79 73, 82 100 Z" />

          {/* Cluster Center-Left */}
          <path d="M110 100 Q 106 65, 98 48 Q 108 66, 114 100 Z" />
          <path d="M125 100 Q 130 68, 138 50 Q 134 70, 129 100 Z" />
          <path d="M142 100 Q 140 76, 135 64 Q 143 75, 146 100 Z" />

          {/* Cluster Center-Right */}
          <path d="M230 100 Q 225 64, 218 46 Q 228 65, 234 100 Z" />
          <path d="M248 100 Q 252 70, 260 54 Q 255 72, 251 100 Z" />
          <path d="M272 100 Q 268 73, 262 58 Q 272 71, 276 100 Z" />

          {/* Cluster Right */}
          <path d="M320 100 Q 315 67, 308 50 Q 318 68, 324 100 Z" />
          <path d="M340 100 Q 346 66, 355 48 Q 350 68, 344 100 Z" />
          <path d="M362 100 Q 360 74, 354 60 Q 363 73, 366 100 Z" />
          <path d="M380 100 Q 384 70, 392 55 Q 388 72, 383 100 Z" />
        </g>

        {/* --- Mid Layer Grass Blades & Emerging Tulip Stems --- */}
        <g fill="url(#meadowGradMid)">
          {/* Left Grass Blades */}
          <path d="M24 102 Q 22 75, 17 62 Q 25 76, 28 102 Z" />
          <path d="M34 102 Q 39 74, 46 60 Q 42 78, 37 102 Z" />
          <path d="M52 102 Q 50 78, 45 66 Q 53 78, 56 102 Z" />
          <path d="M68 102 Q 74 72, 82 58 Q 78 76, 72 102 Z" />
          <path d="M88 102 Q 86 76, 81 64 Q 90 77, 92 102 Z" />

          {/* Center Grass Blades */}
          <path d="M155 102 Q 150 72, 142 56 Q 152 72, 158 102 Z" />
          <path d="M168 102 Q 172 74, 180 58 Q 176 76, 172 102 Z" />
          <path d="M188 102 Q 185 78, 179 66 Q 189 78, 192 102 Z" />
          <path d="M205 102 Q 210 70, 218 55 Q 214 74, 209 102 Z" />

          {/* Right Grass Blades */}
          <path d="M285 102 Q 281 74, 274 58 Q 284 73, 289 102 Z" />
          <path d="M302 102 Q 306 72, 314 56 Q 310 74, 306 102 Z" />
          <path d="M330 102 Q 326 76, 320 62 Q 330 75, 334 102 Z" />
          <path d="M350 102 Q 355 73, 364 58 Q 359 75, 354 102 Z" />
          <path d="M372 102 Q 370 78, 365 65 Q 373 78, 376 102 Z" />
        </g>

        {/* --- Subtle Tulip Silhouettes in Meadow --- */}
        {/* Tulip 1: Left */}
        <g>
          {/* Curved Stem */}
          <path
            d="M84 105 Q 86 78, 88 56"
            stroke="var(--primary)"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.45"
          />
          {/* Leaf */}
          <path
            d="M85 82 Q 95 72, 102 70 Q 94 80, 86 88 Z"
            fill="url(#meadowGradMid)"
          />
          {/* Tulip Flower Bud */}
          <path
            d="M88 56 C 83 54, 80 47, 83 40 C 86 44, 88 47, 88 50 C 88 47, 90 44, 93 40 C 96 47, 93 54, 88 56 Z"
            fill="url(#tulipBudGrad)"
          />
        </g>

        {/* Tulip 2: Center-Left (Taller hero tulip bud) */}
        <g>
          {/* Curved Stem */}
          <path
            d="M198 105 Q 196 68, 194 44"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.55"
          />
          {/* Leaf Left */}
          <path
            d="M197 78 Q 182 68, 172 67 Q 184 78, 196 86 Z"
            fill="url(#meadowGradFront)"
          />
          {/* Leaf Right */}
          <path
            d="M196 72 Q 208 62, 218 61 Q 206 73, 195 80 Z"
            fill="url(#meadowGradFront)"
          />
          {/* Tulip Flower Bud */}
          <path
            d="M194 44 C 188 42, 184 34, 188 26 C 191 31, 194 34, 194 38 C 194 34, 197 31, 200 26 C 204 34, 200 42, 194 44 Z"
            fill="url(#tulipBudGrad)"
          />
          <path
            d="M194 38 C 192 34, 192 30, 194 28 C 196 30, 196 34, 194 38 Z"
            fill="#b586ba"
            opacity="0.9"
          />
        </g>

        {/* Tulip 3: Right */}
        <g>
          {/* Curved Stem */}
          <path
            d="M312 105 Q 314 76, 316 52"
            stroke="var(--primary)"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.45"
          />
          {/* Leaf */}
          <path
            d="M313 80 Q 324 70, 332 68 Q 323 79, 314 87 Z"
            fill="url(#meadowGradMid)"
          />
          {/* Tulip Flower Bud */}
          <path
            d="M316 52 C 311 50, 308 43, 311 36 C 314 40, 316 43, 316 46 C 316 43, 318 40, 321 36 C 324 43, 321 50, 316 52 Z"
            fill="url(#tulipBudGrad)"
          />
        </g>

        {/* --- Foreground Crisp Blades --- */}
        <g fill="url(#meadowGradFront)">
          {/* Left foreground */}
          <path d="M8 105 Q 12 85, 18 72 Q 15 88, 11 105 Z" />
          <path d="M45 105 Q 48 82, 54 68 Q 50 86, 47 105 Z" />
          <path d="M96 105 Q 92 84, 85 70 Q 94 85, 98 105 Z" />

          {/* Center foreground */}
          <path d="M136 105 Q 140 82, 147 68 Q 143 85, 139 105 Z" />
          <path d="M165 105 Q 161 84, 154 70 Q 163 85, 168 105 Z" />
          <path d="M222 105 Q 226 80, 234 66 Q 229 84, 225 105 Z" />
          <path d="M255 105 Q 251 83, 244 69 Q 253 84, 258 105 Z" />

          {/* Right foreground */}
          <path d="M295 105 Q 299 82, 307 68 Q 302 85, 298 105 Z" />
          <path d="M342 105 Q 338 84, 331 70 Q 340 85, 345 105 Z" />
          <path d="M388 105 Q 391 85, 396 74 Q 393 88, 390 105 Z" />
        </g>

        {/* --- Baseline Ground Fill --- */}
        <rect x="0" y="104" width="400" height="6" fill="var(--primary)" opacity="0.3" />
        <rect x="0" y="107" width="400" height="3" fill="var(--primary)" opacity="0.45" />
      </svg>
    </div>
  )
}
