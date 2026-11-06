/**
 * Generates high-resolution studio product imagery as deterministic data-URI SVG/PNG
 * so every product photo renders with 0ms latency, zero broken images, and realistic
 * studio lighting, pedestal shadow, and authentic packaging/produce details in hermetic browsers.
 * If a product already has an external or uploaded data/http image_url that is not a studio slug,
 * it is preserved directly.
 */

interface StudioVisualTheme {
  bgTop: string;
  bgBottom: string;
  pedestalColor: string;
  vesselType: 'jar' | 'pouch' | 'bottle' | 'produce' | 'bowl' | 'box' | 'tin';
  primaryFill: string;
  secondaryFill: string;
  accentFill: string;
  labelBg: string;
  badgeText: string;
}

function pickTheme(slug: string, categorySlug: string): StudioVisualTheme {
  const s = `${slug} ${categorySlug}`.toLowerCase();

  if (s.includes('ghee') || s.includes('honey')) {
    return {
      bgTop: '#FFFBEB',
      bgBottom: '#FEF3C7',
      pedestalColor: '#FDE68A',
      vesselType: 'jar',
      primaryFill: '#F59E0B',
      secondaryFill: '#D97706',
      accentFill: '#78350F',
      labelBg: '#FFFDF7',
      badgeText: 'A2 BILONA PURE',
    };
  }
  if (s.includes('oil') || s.includes('juice') || s.includes('drink') || s.includes('clean')) {
    return {
      bgTop: '#F8FAFC',
      bgBottom: '#FEF9C3',
      pedestalColor: '#E2E8F0',
      vesselType: 'bottle',
      primaryFill: '#CA8A04',
      secondaryFill: '#854D0E',
      accentFill: '#065F46',
      labelBg: '#FFFFFF',
      badgeText: 'WOOD PRESSED',
    };
  }
  if (s.includes('fruit') || s.includes('veg') || s.includes('green') || s.includes('leaf') || s.includes('ginger') || s.includes('tulsi')) {
    return {
      bgTop: '#F0FDF4',
      bgBottom: '#DCFCE7',
      pedestalColor: '#BBF7D0',
      vesselType: 'produce',
      primaryFill: '#16A34A',
      secondaryFill: '#15803D',
      accentFill: '#DC2626',
      labelBg: '#FFFFFF',
      badgeText: 'CERTIFIED ORGANIC',
    };
  }
  if (s.includes('masala') || s.includes('spice') || s.includes('turmeric') || s.includes('pepper') || s.includes('ajwain')) {
    return {
      bgTop: '#FFF7ED',
      bgBottom: '#FFEDD5',
      pedestalColor: '#FED7AA',
      vesselType: 'bowl',
      primaryFill: '#EA580C',
      secondaryFill: '#9A3412',
      accentFill: '#B45309',
      labelBg: '#FFFBEB',
      badgeText: 'STONE GROUND',
    };
  }
  if (s.includes('dairy') || s.includes('paneer') || s.includes('milk') || s.includes('curd') || s.includes('egg')) {
    return {
      bgTop: '#F0F9FF',
      bgBottom: '#E0F2FE',
      pedestalColor: '#BAE6FD',
      vesselType: 'box',
      primaryFill: '#0284C7',
      secondaryFill: '#0369A1',
      accentFill: '#059669',
      labelBg: '#FFFFFF',
      badgeText: 'FARM FRESH A2',
    };
  }
  if (s.includes('makhana') || s.includes('snack') || s.includes('sweet') || s.includes('bakery') || s.includes('tea') || s.includes('coffee')) {
    return {
      bgTop: '#FAF5FF',
      bgBottom: '#F3E8FF',
      pedestalColor: '#E9D5FF',
      vesselType: 'tin',
      primaryFill: '#7C3AED',
      secondaryFill: '#5B21B6',
      accentFill: '#D97706',
      labelBg: '#FFFFFF',
      badgeText: 'ROASTED ARTISANAL',
    };
  }
  return {
    bgTop: '#F7FEE7',
    bgBottom: '#ECFCCB',
    pedestalColor: '#D9F99D',
    vesselType: 'pouch',
    primaryFill: '#059669',
    secondaryFill: '#065F46',
    accentFill: '#B45309',
    labelBg: '#FFFFFF',
    badgeText: '100% UNPOLISHED',
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildStudioProductDataUri(
  name: string,
  slug: string,
  categorySlug = 'organic',
  unitLabel = '500 g'
): string {
  const theme = pickTheme(slug, categorySlug);
  const words = name.replace(/Bharat Organic\s*/i, '').split(/\s+/);
  const line1 = escapeXml(words.slice(0, 2).join(' ').slice(0, 18));
  const line2 = escapeXml(words.slice(2, 5).join(' ').slice(0, 20));
  const cleanUnit = escapeXml(unitLabel);
  const badge = escapeXml(theme.badgeText);

  let vesselMarkup = '';

  if (theme.vesselType === 'jar') {
    vesselMarkup = `
      <!-- Glass Apothecary Jar with Golden Ghee/Honey -->
      <ellipse cx="200" cy="318" rx="84" ry="16" fill="#000000" opacity="0.12"/>
      <rect x="128" y="130" width="144" height="175" rx="28" fill="url(#vesselGrad)" stroke="#FFFFFF" stroke-width="3"/>
      <!-- Granular texture highlights -->
      <circle cx="158" cy="245" r="18" fill="#FDE68A" opacity="0.35"/>
      <circle cx="230" cy="260" r="24" fill="#FCD34D" opacity="0.3"/>
      <!-- Brass Lid -->
      <rect x="142" y="102" width="116" height="30" rx="8" fill="url(#lidGrad)"/>
      <rect x="138" y="124" width="124" height="9" rx="4" fill="#78350F"/>
      <!-- Glass specular reflection -->
      <path d="M142 145 Q138 215 144 285" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity="0.55" fill="none"/>
      <!-- Front Label -->
      <rect x="144" y="172" width="112" height="92" rx="10" fill="${theme.labelBg}" stroke="#F59E0B" stroke-width="1.5"/>
      <rect x="156" y="180" width="88" height="14" rx="4" fill="#065F46"/>
      <text x="200" y="190" font-family="Plus Jakarta Sans, sans-serif" font-size="7.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">${badge}</text>
      <text x="200" y="212" font-family="Outfit, sans-serif" font-size="13" font-weight="800" fill="#1E293B" text-anchor="middle">${line1}</text>
      <text x="200" y="228" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" font-weight="600" fill="#475569" text-anchor="middle">${line2}</text>
      <text x="200" y="252" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#059669" text-anchor="middle">NET WT: ${cleanUnit}</text>
    `;
  } else if (theme.vesselType === 'bottle') {
    vesselMarkup = `
      <!-- Cold-Pressed Glass Bottle -->
      <ellipse cx="200" cy="322" rx="68" ry="14" fill="#000000" opacity="0.12"/>
      <path d="M176 82 L224 82 L228 130 L252 162 L252 304 Q252 318 236 318 L164 318 Q148 318 148 304 L148 162 L172 130 Z" fill="url(#vesselGrad)" stroke="#FFFFFF" stroke-width="2.5"/>
      <rect x="174" y="64" width="52" height="22" rx="5" fill="#065F46"/>
      <path d="M160 172 L160 296" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.5"/>
      <rect x="156" y="176" width="88" height="106" rx="8" fill="${theme.labelBg}" stroke="#E2E8F0" stroke-width="1.5"/>
      <rect x="164" y="185" width="72" height="14" rx="3" fill="#059669"/>
      <text x="200" y="195" font-family="Plus Jakarta Sans, sans-serif" font-size="7" font-weight="700" fill="#FFFFFF" text-anchor="middle">${badge}</text>
      <text x="200" y="218" font-family="Outfit, sans-serif" font-size="12" font-weight="800" fill="#0F172A" text-anchor="middle">${line1}</text>
      <text x="200" y="234" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="600" fill="#475569" text-anchor="middle">${line2}</text>
      <text x="200" y="266" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" fill="#B45309" text-anchor="middle">${cleanUnit}</text>
    `;
  } else if (theme.vesselType === 'produce') {
    vesselMarkup = `
      <!-- Woven Harvest Basket & Fresh Organic Produce -->
      <ellipse cx="200" cy="316" rx="96" ry="18" fill="#000000" opacity="0.12"/>
      <!-- Leafy clusters & produce -->
      <circle cx="156" cy="182" r="44" fill="#16A34A"/>
      <circle cx="204" cy="164" r="48" fill="#15803D"/>
      <circle cx="246" cy="188" r="40" fill="#22C55E"/>
      <circle cx="176" cy="202" r="34" fill="#4ADE80"/>
      <circle cx="226" cy="204" r="32" fill="#EF4444"/>
      <circle cx="216" cy="196" r="10" fill="#FCA5A5" opacity="0.5"/>
      <!-- Dew drops -->
      <circle cx="164" cy="168" r="4" fill="#FFFFFF" opacity="0.8"/>
      <circle cx="212" cy="152" r="3.5" fill="#FFFFFF" opacity="0.8"/>
      <!-- Terracotta / Woven Crate Base -->
      <path d="M108 212 L292 212 L272 308 Q268 316 254 316 L146 316 Q132 316 128 308 Z" fill="#D97706" stroke="#B45309" stroke-width="2"/>
      <rect x="128" y="228" width="144" height="68" rx="10" fill="#FFFFFF" stroke="#DCFCE7" stroke-width="2"/>
      <text x="200" y="247" font-family="Plus Jakarta Sans, sans-serif" font-size="8" font-weight="800" fill="#15803D" text-anchor="middle">${badge}</text>
      <text x="200" y="266" font-family="Outfit, sans-serif" font-size="13.5" font-weight="800" fill="#0F172A" text-anchor="middle">${line1}</text>
      <text x="200" y="282" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" font-weight="600" fill="#475569" text-anchor="middle">${line2} · ${cleanUnit}</text>
    `;
  } else if (theme.vesselType === 'bowl') {
    vesselMarkup = `
      <!-- Ceramic Spice Bowl & Kraft Standup Pouch -->
      <ellipse cx="200" cy="318" rx="90" ry="16" fill="#000000" opacity="0.13"/>
      <rect x="124" y="106" width="152" height="202" rx="18" fill="url(#vesselGrad)" stroke="#FFFFFF" stroke-width="2.5"/>
      <rect x="138" y="134" width="124" height="142" rx="12" fill="${theme.labelBg}"/>
      <rect x="150" y="146" width="100" height="15" rx="4" fill="#9A3412"/>
      <text x="200" y="157" font-family="Plus Jakarta Sans, sans-serif" font-size="7.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">${badge}</text>
      <text x="200" y="184" font-family="Outfit, sans-serif" font-size="14" font-weight="800" fill="#1E293B" text-anchor="middle">${line1}</text>
      <text x="200" y="202" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">${line2}</text>
      <!-- Spice Mound Window -->
      <circle cx="200" cy="236" r="22" fill="${theme.primaryFill}"/>
      <circle cx="193" cy="230" r="6" fill="#FDBA74" opacity="0.5"/>
      <text x="200" y="270" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700" fill="#9A3412" text-anchor="middle">PACK: ${cleanUnit}</text>
    `;
  } else {
    vesselMarkup = `
      <!-- Stand-up Organic Kraft & Matte Pouch -->
      <ellipse cx="200" cy="320" rx="88" ry="15" fill="#000000" opacity="0.12"/>
      <path d="M122 104 Q200 96 278 104 L288 302 Q288 314 272 314 L128 314 Q112 314 112 302 Z" fill="url(#vesselGrad)" stroke="#FFFFFF" stroke-width="2.5"/>
      <line x1="126" y1="122" x2="274" y2="122" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
      <rect x="134" y="140" width="132" height="144" rx="14" fill="${theme.labelBg}" stroke="#E2E8F0" stroke-width="1.5"/>
      <rect x="148" y="152" width="104" height="16" rx="4" fill="${theme.secondaryFill}"/>
      <text x="200" y="163" font-family="Plus Jakarta Sans, sans-serif" font-size="7.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">${badge}</text>
      <text x="200" y="192" font-family="Outfit, sans-serif" font-size="14.5" font-weight="800" fill="#0F172A" text-anchor="middle">${line1}</text>
      <text x="200" y="210" font-family="Plus Jakarta Sans, sans-serif" font-size="11.5" font-weight="600" fill="#475569" text-anchor="middle">${line2}</text>
      <!-- Organic Emblem -->
      <circle cx="200" cy="240" r="16" fill="${theme.bgBottom}" stroke="${theme.primaryFill}" stroke-width="1.5"/>
      <path d="M193 242 Q200 228 208 236 Q202 248 193 242 Z" fill="${theme.primaryFill}"/>
      <text x="200" y="274" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700" fill="${theme.secondaryFill}" text-anchor="middle">NET WT: ${cleanUnit}</text>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.bgTop}"/>
        <stop offset="100%" stop-color="${theme.bgBottom}"/>
      </linearGradient>
      <linearGradient id="vesselGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${theme.primaryFill}"/>
        <stop offset="100%" stop-color="${theme.secondaryFill}"/>
      </linearGradient>
      <linearGradient id="lidGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#D97706"/>
        <stop offset="50%" stop-color="#FDE68A"/>
        <stop offset="100%" stop-color="#B45309"/>
      </linearGradient>
    </defs>
    <!-- Studio Backdrop -->
    <rect width="400" height="400" rx="24" fill="url(#bgGrad)"/>
    <!-- Soft Studio Light Beam -->
    <circle cx="90" cy="70" r="170" fill="#FFFFFF" opacity="0.45"/>
    <!-- Studio Travertine Pedestal -->
    <ellipse cx="200" cy="332" rx="138" ry="26" fill="${theme.pedestalColor}" opacity="0.65"/>
    <ellipse cx="200" cy="326" rx="126" ry="20" fill="#FFFFFF" opacity="0.8"/>
    <!-- Bharat Organic Watermark Seal -->
    <text x="200" y="46" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="#065F46" letter-spacing="1.5" opacity="0.75" text-anchor="middle">BHARAT ORGANIC · FARM CERTIFIED</text>
    ${vesselMarkup}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function resolveProductPhoto(product: {
  name: string;
  slug: string;
  imageUrl?: string;
  unitLabel?: string;
  categorySlug?: string;
}): string {
  if (
    product.imageUrl &&
    (product.imageUrl.startsWith('data:image/') ||
      product.imageUrl.startsWith('http://') ||
      product.imageUrl.startsWith('https://') ||
      product.imageUrl.startsWith('/api/'))
  ) {
    return product.imageUrl;
  }
  return buildStudioProductDataUri(
    product.name,
    product.slug,
    product.categorySlug || product.slug,
    product.unitLabel || '500 g'
  );
}
