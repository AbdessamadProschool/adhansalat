/**
 * Mihrab An-Noor & Rings of Sakīnah (محراب النور وحلقات السكينة)
 *
 * Elite 2D Islamic Luxury Concentric Rings Widget
 * Pure SVG & CSS — 100% Offline — Zero External Dependencies — Battery Conscious (60 FPS)
 * Inspired by high horology celestial dials, historic Andalusian astrolabes, and royal Moroccan zellige.
 *
 * Features:
 * - 3 Concentric Sacred Rings: 5 Prayers with Zellige Stars, Hisn Adhkar Gold Arc, Dynamic Tasbih Ring.
 * - Astrolabe graduation dial with 72 celestial ticks.
 * - Central Andalusian Khatam Star with sacred breathing halo.
 * - Interactive "Fiche de Signalisation" (بطاقة الإشارات ودليل المحراب) explaining every ring.
 * - Golden Shockwave ripple upon Tasbih tap.
 */

import type { SpiritualProgress } from './spiritual-tree.js';

export interface SpiritualMihrabState {
  prayersDone: number;   // 0 to 5 (Fajr, Dhuhr, Asr, Maghrib, Isha)
  adhkarDone: number;    // 0 to 3 (Morning, Evening, Night/Wird)
  tasbihCount: number;   // e.g. 0 to 100+
  tasbihTarget: number;  // e.g. 33, 99, 100
}

export type CenterDisplayMode = 'percent' | 'tasbih' | 'prayers';

const NS = 'http://www.w3.org/2000/svg';

interface PrayerNodeConfig {
  id: string;
  nameAr: string;
  angleDeg: number;       // Angle in dial coordinate system (top = -90)
  arcStartDeg: number;
  arcEndDeg: number;
}

export class MihrabNoorWidget {
  private container: HTMLElement;
  private svg!: SVGSVGElement;
  private state: SpiritualMihrabState;
  private displayMode: CenterDisplayMode = 'percent';
  private isFicheOpen = false;

  // SVG Elements
  private prayerArcElements: SVGPathElement[] = [];
  private prayerStarElements: SVGGElement[] = [];
  private adhkarArcElement!: SVGCircleElement;
  private adhkarPearlElements: SVGCircleElement[] = [];
  private tasbihArcElement!: SVGCircleElement;
  private tasbihShockwaveElement!: SVGCircleElement;
  private tasbihGroupElement!: SVGGElement;
  private centerKhatamElement!: SVGGElement;
  private centerValueText!: SVGTextElement;
  private centerLabelText!: SVGTextElement;
  private centerSubText!: SVGTextElement;

  // HTML Elements
  private legendPrayerVal!: HTMLElement;
  private legendAdhkarVal!: HTMLElement;
  private legendTasbihVal!: HTMLElement;
  private legendTotalPercentVal!: HTMLElement;
  private ficheContainer!: HTMLElement;
  private ficheToggleBtn!: HTMLButtonElement;

  // Geometry Constants
  private readonly CX = 190;
  private readonly CY = 190;
  private readonly R_PRAYER = 142;
  private readonly R_ASTROLABE = 122;
  private readonly R_ADHKAR = 104;
  private readonly R_TASBIH = 74;
  private readonly C_ADHKAR = 2 * Math.PI * 104; // ~653.45
  private readonly C_TASBIH = 2 * Math.PI * 74;  // ~464.95

  private readonly PRAYER_NODES: readonly PrayerNodeConfig[] = [
    { id: 'fajr',    nameAr: 'فجر',  angleDeg: -90, arcStartDeg: -83, arcEndDeg: -25 },
    { id: 'dhuhr',   nameAr: 'ظهر',  angleDeg: -18, arcStartDeg: -11, arcEndDeg: 47 },
    { id: 'asr',     nameAr: 'عصر',  angleDeg: 54,  arcStartDeg: 61,  arcEndDeg: 119 },
    { id: 'maghrib', nameAr: 'مغرب', angleDeg: 126, arcStartDeg: 133, arcEndDeg: 191 },
    { id: 'isha',    nameAr: 'عشاء', angleDeg: 198, arcStartDeg: 205, arcEndDeg: 263 },
  ];

  constructor(initialState?: Partial<SpiritualMihrabState>) {
    this.state = {
      prayersDone: initialState?.prayersDone ?? 0,
      adhkarDone: initialState?.adhkarDone ?? 0,
      tasbihCount: initialState?.tasbihCount ?? 0,
      tasbihTarget: initialState?.tasbihTarget ?? 33,
    };

    this.container = document.createElement('div');
    this.container.className = 'mihrab-noor-card';
    this.initCardStructure();
    this.update(
      this.state.prayersDone,
      this.state.adhkarDone,
      this.state.tasbihCount,
      this.state.tasbihTarget
    );
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public getState(): Readonly<SpiritualMihrabState> {
    return this.state;
  }

  /**
   * Updates all three rings, center metrics, and legend counters
   */
  public update(
    prayersDone: number,
    adhkarDone: number,
    tasbihCount: number,
    tasbihTarget: number
  ): void {
    this.state.prayersDone = Math.max(0, Math.min(5, prayersDone));
    this.state.adhkarDone = Math.max(0, Math.min(3, adhkarDone));
    this.state.tasbihCount = Math.max(0, tasbihCount);
    this.state.tasbihTarget = Math.max(1, tasbihTarget);

    // 1. Outer Ring: 5 Prayer Segments & Moroccan Zellige Star Markers
    for (let i = 0; i < 5; i++) {
      const isCompleted = i < this.state.prayersDone;
      const arc = this.prayerArcElements[i];
      const star = this.prayerStarElements[i];

      if (arc) {
        arc.classList.toggle('prayer-lit', isCompleted);
      }
      if (star) {
        star.classList.toggle('star-lit', isCompleted);
      }
    }

    // 2. Middle Ring: Hisn & Adhkar Golden Arc
    const adhkarRatio = Math.min(1, this.state.adhkarDone / 3);
    const adhkarOffset = this.C_ADHKAR * (1 - adhkarRatio);
    this.adhkarArcElement.style.strokeDashoffset = adhkarOffset.toFixed(2);

    for (let i = 0; i < 3; i++) {
      const pearl = this.adhkarPearlElements[i];
      if (pearl) {
        pearl.classList.toggle('pearl-lit', i < this.state.adhkarDone);
      }
    }

    // 3. Inner Ring: Wird & Tasbih Progress Arc
    const tasbihRatio = Math.min(1, this.state.tasbihCount / this.state.tasbihTarget);
    const tasbihOffset = this.C_TASBIH * (1 - tasbihRatio);
    this.tasbihArcElement.style.strokeDashoffset = tasbihOffset.toFixed(2);

    // 4. Center Metric & Spiritual Progress Percentage
    const prayerPercent = (this.state.prayersDone / 5) * 50;
    const adhkarPercent = (this.state.adhkarDone / 3) * 25;
    const tasbihPercent = tasbihRatio * 25;
    const totalPercentage = Math.min(100, Math.round(prayerPercent + adhkarPercent + tasbihPercent));

    this.renderCenterMetric(totalPercentage);

    // 5. Update HTML Legend Counters
    if (this.legendPrayerVal) {
      this.legendPrayerVal.textContent = `${this.state.prayersDone}/5`;
    }
    if (this.legendAdhkarVal) {
      this.legendAdhkarVal.textContent = `${this.state.adhkarDone}/3`;
    }
    if (this.legendTasbihVal) {
      this.legendTasbihVal.textContent = `${this.state.tasbihCount}/${this.state.tasbihTarget}`;
    }
    if (this.legendTotalPercentVal) {
      this.legendTotalPercentVal.textContent = `${totalPercentage}%`;
    }

    // 6. Update Fiche states if open
    this.updateFicheProgress(totalPercentage);
  }

  /**
   * Updates state from standard SpiritualProgress object
   */
  public updateFromSpiritualProgress(progress: SpiritualProgress, tasbihTarget = 33): void {
    let adhkarCount = 0;
    if (progress.morningAdhkarDone) adhkarCount++;
    if (progress.eveningAdhkarDone) adhkarCount++;
    if (progress.quranRead) adhkarCount++;

    this.update(
      progress.prayersCompleted,
      adhkarCount,
      progress.dhikrCount,
      tasbihTarget
    );
  }

  /**
   * Sends an instant golden shockwave around the inner ring with haptic feedback
   */
  public pulseTasbih(): void {
    this.tasbihShockwaveElement.classList.remove('active-shockwave');
    this.tasbihGroupElement.classList.remove('tasbih-recoil');

    // Force reflow
    void this.tasbihShockwaveElement.getBoundingClientRect();

    this.tasbihShockwaveElement.classList.add('active-shockwave');
    this.tasbihGroupElement.classList.add('tasbih-recoil');

    // Emit golden Noor light particle rising upwards
    this.spawnNoorParticle();

    // Micro-haptic tactile click
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(12);
      } catch {
        // Safe sandboxed fallback
      }
    }

    setTimeout(() => {
      this.tasbihGroupElement.classList.remove('tasbih-recoil');
    }, 450);
  }

  public setDisplayMode(mode: CenterDisplayMode): void {
    this.displayMode = mode;
    this.update(
      this.state.prayersDone,
      this.state.adhkarDone,
      this.state.tasbihCount,
      this.state.tasbihTarget
    );
  }

  public toggleDisplayMode(): void {
    if (this.displayMode === 'percent') {
      this.displayMode = 'tasbih';
    } else if (this.displayMode === 'tasbih') {
      this.displayMode = 'prayers';
    } else {
      this.displayMode = 'percent';
    }
    this.update(
      this.state.prayersDone,
      this.state.adhkarDone,
      this.state.tasbihCount,
      this.state.tasbihTarget
    );
  }

  public toggleFiche(): void {
    this.isFicheOpen = !this.isFicheOpen;
    this.ficheContainer.classList.toggle('is-open', this.isFicheOpen);
    this.ficheToggleBtn.classList.toggle('active', this.isFicheOpen);
    this.ficheToggleBtn.setAttribute('aria-expanded', this.isFicheOpen ? 'true' : 'false');
  }

  /* -------------------------------------------------------------------------- */
  /*                              INTERNAL BUILDERS                             */
  /* -------------------------------------------------------------------------- */

  private initCardStructure(): void {
    // Header with Fiche de Signalisation Button
    const header = document.createElement('div');
    header.className = 'mihrab-card-header';
    header.innerHTML = `
      <div class="mihrab-header-main">
        <div class="mihrab-title-group">
          <span class="mihrab-khatam-icon">۞</span>
          <h3 class="mihrab-title">محراب النور وحلقات السكينة</h3>
        </div>
        <div class="mihrab-header-actions">
          <button type="button" class="fiche-signal-btn" title="دليل قراءة حلقات المحراب" aria-expanded="false">
            <span class="fiche-icon">📜</span>
            <span class="fiche-text">دليل المحراب</span>
          </button>
          <span class="mihrab-status-badge">
            <span class="badge-dot"></span>
            <span>في مَعِيّةِ الله</span>
          </span>
        </div>
      </div>
      <p class="mihrab-subtitle">حلقات السكينة والبركة الثلاث • الصلوات والأذكار والورد</p>
    `;
    this.container.appendChild(header);

    this.ficheToggleBtn = header.querySelector('.fiche-signal-btn')!;
    this.ficheToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFiche();
    });

    // Fiche de Signalisation Drawer / Panel (بطاقة الإشارات والبيان)
    this.ficheContainer = document.createElement('div');
    this.ficheContainer.className = 'mihrab-fiche-panel';
    this.ficheContainer.innerHTML = `
      <div class="fiche-inner">
        <div class="fiche-title-row">
          <span class="fiche-badge">📜 بطاقة الإشارات والبيان الفلكي</span>
          <button type="button" class="fiche-close-btn" aria-label="إغلاق الدليل">✕</button>
        </div>
        <p class="fiche-desc">دليل قراءة محراب النور المستوحى من الإسطرلاب الأندلسي والزليج المغربي:</p>
        
        <div class="fiche-items-list">
          <div class="fiche-row prayer-row" data-ring="prayer">
            <span class="fiche-ring-dot emerald-dot"></span>
            <div class="fiche-row-content">
              <strong>1. مدار الصلوات الخمس (الحلقة الخارجية):</strong>
              <p>5 محطات مقدسة (فجر، ظهر، عصر، مغرب، عشاء) تتوهج بالزمرد المشع ونجمة زليج مغربية ثمانية الأضلاع عند أداء كل فريضة.</p>
              <div class="fiche-status-pill prayer-status-pill">الحالة: <span id="fiche-prayer-stat">0/5 صلوات</span></div>
            </div>
          </div>

          <div class="fiche-row astrolabe-row" data-ring="astrolabe">
            <span class="fiche-ring-dot bronze-dot"></span>
            <div class="fiche-row-content">
              <strong>2. حلقة الإسطرلاب الفلكية (72 تدريجة):</strong>
              <p>مستوحاة من إسطرلابات فاس التاريخية لحساب ساعات السكينة وتناسق الزمن الروحي على مدار اليوم.</p>
            </div>
          </div>

          <div class="fiche-row adhkar-row" data-ring="adhkar">
            <span class="fiche-ring-dot gold-dot"></span>
            <div class="fiche-row-content">
              <strong>3. مدار حصن اليوم والأذكار (الحلقة الوسطى):</strong>
              <p>قوس ذهب خالص عيار 24 يكتمل مع أورادك الثلاثة: أذكار الصباح، أذكار المساء، وورد النوم، مزدان بـ 3 لآلئ ذهبية.</p>
              <div class="fiche-status-pill adhkar-status-pill">الحالة: <span id="fiche-adhkar-stat">0/3 أوراد</span></div>
            </div>
          </div>

          <div class="fiche-row tasbih-row" data-ring="tasbih">
            <span class="fiche-ring-dot amber-dot"></span>
            <div class="fiche-row-content">
              <strong>4. مدار الورد والتسبيح (الحلقة الداخلية):</strong>
              <p>قوس يملؤه نور الذكر مباشرة مع كل تسبيحة، ويرسل موجة ارتدادية ذهبية (Shockwave) مع كل ضغطة.</p>
              <div class="fiche-status-pill tasbih-status-pill">الحالة: <span id="fiche-tasbih-stat">0/33 تسبيحة</span></div>
            </div>
          </div>

          <div class="fiche-row khatam-row" data-ring="khatam">
            <span class="fiche-ring-dot star-dot">۞</span>
            <div class="fiche-row-content">
              <strong>5. خاتم الأندلس والسكينة (الجوهرة المركزية):</strong>
              <p>نجمة هندسية ثمانية تتنفس بهدوء وتجمع حصاد يومك الروحي الإجمالي في نسبة مئوية شاملة.</p>
              <div class="fiche-status-pill total-status-pill">السكينة: <span id="fiche-total-stat">0%</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.ficheContainer);

    const closeBtn = this.ficheContainer.querySelector('.fiche-close-btn')!;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFiche();
    });

    // Add click highlighting between fiche rows and dial rings
    const rows = this.ficheContainer.querySelectorAll('.fiche-row');
    rows.forEach((row) => {
      row.addEventListener('click', () => {
        const ringType = row.getAttribute('data-ring');
        this.highlightRing(ringType);
      });
    });

    // SVG Dial Container
    const dialContainer = document.createElement('div');
    dialContainer.className = 'mihrab-dial-container';
    dialContainer.setAttribute('role', 'region');
    dialContainer.setAttribute('aria-label', 'حلقات السكينة والبركة');

    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', '0 0 380 380');
    this.svg.setAttribute('class', 'mihrab-svg-dial');
    this.svg.setAttribute('role', 'img');

    this.buildDefs();
    this.buildCelestialDialLayers();

    dialContainer.appendChild(this.svg);
    this.container.appendChild(dialContainer);

    // Footer Legend Bar
    const legendBar = document.createElement('div');
    legendBar.className = 'mihrab-legend-bar';
    legendBar.innerHTML = `
      <div class="legend-pill prayer-pill" title="انقر لعرض تفاصيل الصلوات">
        <span class="legend-indicator emerald-ind"></span>
        <span class="legend-label">الصلوات</span>
        <span class="legend-val" id="mihrab-legend-prayer">0/5</span>
      </div>
      <div class="legend-pill adhkar-pill" title="انقر لعرض تفاصيل الأذكار">
        <span class="legend-indicator gold-ind"></span>
        <span class="legend-label">الأذكار</span>
        <span class="legend-val" id="mihrab-legend-adhkar">0/3</span>
      </div>
      <div class="legend-pill tasbih-pill" title="انقر لعرض تفاصيل التسبيح">
        <span class="legend-indicator amber-ind"></span>
        <span class="legend-label">التسبيح</span>
        <span class="legend-val" id="mihrab-legend-tasbih">0/33</span>
      </div>
      <div class="legend-pill total-pill" title="انقر لتبديل عرض الجوهرة">
        <span class="legend-indicator total-ind">✦</span>
        <span class="legend-label">السكينة</span>
        <span class="legend-val" id="mihrab-legend-total">0%</span>
      </div>
    `;
    this.container.appendChild(legendBar);

    // Store references
    this.legendPrayerVal = legendBar.querySelector('#mihrab-legend-prayer')!;
    this.legendAdhkarVal = legendBar.querySelector('#mihrab-legend-adhkar')!;
    this.legendTasbihVal = legendBar.querySelector('#mihrab-legend-tasbih')!;
    this.legendTotalPercentVal = legendBar.querySelector('#mihrab-legend-total')!;

    // Clicking legend pill toggles Fiche with context
    legendBar.addEventListener('click', () => this.toggleFiche());
  }

  private highlightRing(ringType: string | null): void {
    if (!ringType) return;
    this.svg.classList.remove('highlight-prayer', 'highlight-adhkar', 'highlight-tasbih', 'highlight-khatam');
    void this.svg.getBoundingClientRect(); // reflow
    this.svg.classList.add(`highlight-${ringType}`);
    setTimeout(() => {
      this.svg.classList.remove(`highlight-${ringType}`);
    }, 1800);
  }

  private updateFicheProgress(totalPercentage: number): void {
    const prayerStat = this.container.querySelector('#fiche-prayer-stat');
    if (prayerStat) prayerStat.textContent = `${this.state.prayersDone}/5 صلوات`;

    const adhkarStat = this.container.querySelector('#fiche-adhkar-stat');
    if (adhkarStat) adhkarStat.textContent = `${this.state.adhkarDone}/3 أوراد`;

    const tasbihStat = this.container.querySelector('#fiche-tasbih-stat');
    if (tasbihStat) tasbihStat.textContent = `${this.state.tasbihCount}/${this.state.tasbihTarget} تسبيحة`;

    const totalStat = this.container.querySelector('#fiche-total-stat');
    if (totalStat) totalStat.textContent = `${totalPercentage}%`;
  }

  private buildDefs(): void {
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = `
      <!-- Royal Emerald Gradient for Prayers -->
      <linearGradient id="mihrabPrayerEmeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#059669"/>
        <stop offset="50%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#34d399"/>
      </linearGradient>

      <!-- Celestial Gold Arc Gradient for Adhkar -->
      <linearGradient id="mihrabAdhkarGoldGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#b45309"/>
        <stop offset="35%" stop-color="#f59e0b"/>
        <stop offset="75%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#fef08a"/>
      </linearGradient>

      <!-- Amber to Radiant Emerald Gradient for Tasbih -->
      <linearGradient id="mihrabTasbihArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f59e0b"/>
        <stop offset="50%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#34d399"/>
      </linearGradient>

      <!-- Golden Shockwave Gradient -->
      <radialGradient id="mihrabShockwaveGrad" cx="50%" cy="50%" r="50%">
        <stop offset="70%" stop-color="rgba(251, 191, 36, 0.8)"/>
        <stop offset="100%" stop-color="rgba(16, 185, 129, 0)"/>
      </radialGradient>

      <!-- Central Jewel Medallion Radial Gradient -->
      <radialGradient id="mihrabCenterJewelGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#0a3c2c"/>
        <stop offset="55%" stop-color="#06251b"/>
        <stop offset="90%" stop-color="#02140e"/>
        <stop offset="100%" stop-color="#1e3a2b"/>
      </radialGradient>

      <!-- Sacred Aura Glow Filter -->
      <filter id="mihrabEmeraldGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.5" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>

      <!-- Gold Star Twinkle Filter -->
      <filter id="mihrabGoldGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    `;
    this.svg.appendChild(defs);
  }

  private buildCelestialDialLayers(): void {
    // 1. Ambient Background Sacred Aura
    const aura = document.createElementNS(NS, 'circle');
    aura.setAttribute('cx', String(this.CX));
    aura.setAttribute('cy', String(this.CY));
    aura.setAttribute('r', '172');
    aura.setAttribute('class', 'mihrab-ambient-aura');
    this.svg.appendChild(aura);

    // 2. Astrolabe Celestial Graduation Ring (72 ticks)
    const astrolabeGroup = document.createElementNS(NS, 'g');
    astrolabeGroup.setAttribute('class', 'astrolabe-dial-group');
    for (let deg = 0; deg < 360; deg += 5) {
      const isMajor = deg % 15 === 0;
      const rInner = isMajor ? this.R_ASTROLABE - 4 : this.R_ASTROLABE - 2;
      const rOuter = this.R_ASTROLABE;
      const rad = (deg * Math.PI) / 180;
      const x1 = this.CX + rInner * Math.cos(rad);
      const y1 = this.CY + rInner * Math.sin(rad);
      const x2 = this.CX + rOuter * Math.cos(rad);
      const y2 = this.CY + rOuter * Math.sin(rad);

      const tick = document.createElementNS(NS, 'line');
      tick.setAttribute('x1', x1.toFixed(2));
      tick.setAttribute('y1', y1.toFixed(2));
      tick.setAttribute('x2', x2.toFixed(2));
      tick.setAttribute('y2', y2.toFixed(2));
      tick.setAttribute('class', isMajor ? 'astrolabe-tick major' : 'astrolabe-tick');
      astrolabeGroup.appendChild(tick);
    }
    this.svg.appendChild(astrolabeGroup);

    // 3. Ring 1: 5 Daily Prayers (Outer Ring)
    const prayersGroup = document.createElementNS(NS, 'g');
    prayersGroup.setAttribute('class', 'prayer-ring-group');

    this.prayerArcElements = [];
    this.prayerStarElements = [];

    this.PRAYER_NODES.forEach((node) => {
      // Background Arc Slot
      const trackPath = document.createElementNS(NS, 'path');
      trackPath.setAttribute('d', this.describeArc(this.CX, this.CY, this.R_PRAYER, node.arcStartDeg, node.arcEndDeg));
      trackPath.setAttribute('class', 'prayer-segment-track');
      trackPath.setAttribute('stroke-width', '12');
      prayersGroup.appendChild(trackPath);

      // Active Radiant Arc
      const arcPath = document.createElementNS(NS, 'path');
      arcPath.setAttribute('d', this.describeArc(this.CX, this.CY, this.R_PRAYER, node.arcStartDeg, node.arcEndDeg));
      arcPath.setAttribute('class', 'prayer-segment-arc');
      arcPath.setAttribute('stroke-width', '12');
      arcPath.setAttribute('stroke', 'url(#mihrabPrayerEmeraldGrad)');
      arcPath.setAttribute('filter', 'url(#mihrabEmeraldGlow)');
      prayersGroup.appendChild(arcPath);
      this.prayerArcElements.push(arcPath);

      // Moroccan 8-Point Zellige Star Marker at Prayer Station Node
      const rad = (node.angleDeg * Math.PI) / 180;
      const starX = this.CX + this.R_PRAYER * Math.cos(rad);
      const starY = this.CY + this.R_PRAYER * Math.sin(rad);

      const starG = document.createElementNS(NS, 'g');
      starG.setAttribute('transform', `translate(${starX.toFixed(2)}, ${starY.toFixed(2)})`);
      starG.setAttribute('class', 'prayer-star-marker');

      const starPolygon = document.createElementNS(NS, 'polygon');
      starPolygon.setAttribute('points', this.generateStarPoints(0, 0, 8, 3.4));
      starPolygon.setAttribute('class', 'prayer-star-shape');

      const starCenter = document.createElementNS(NS, 'circle');
      starCenter.setAttribute('cx', '0');
      starCenter.setAttribute('cy', '0');
      starCenter.setAttribute('r', '1.4');
      starCenter.setAttribute('class', 'prayer-star-core');

      starG.appendChild(starPolygon);
      starG.appendChild(starCenter);
      prayersGroup.appendChild(starG);
      this.prayerStarElements.push(starG);

      // Micro Prayer Label
      const labelRad = ((node.angleDeg) * Math.PI) / 180;
      const labelDist = this.R_PRAYER + 18;
      const labelX = this.CX + labelDist * Math.cos(labelRad);
      const labelY = this.CY + labelDist * Math.sin(labelRad);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', labelX.toFixed(2));
      label.setAttribute('y', (labelY + 4).toFixed(2));
      label.setAttribute('class', 'prayer-dial-label');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = node.nameAr;
      prayersGroup.appendChild(label);
    });

    this.svg.appendChild(prayersGroup);

    // 4. Ring 2: Hisn & Daily Adhkar (Middle Ring)
    const adhkarGroup = document.createElementNS(NS, 'g');
    adhkarGroup.setAttribute('class', 'adhkar-ring-group');

    const adhkarTrack = document.createElementNS(NS, 'circle');
    adhkarTrack.setAttribute('cx', String(this.CX));
    adhkarTrack.setAttribute('cy', String(this.CY));
    adhkarTrack.setAttribute('r', String(this.R_ADHKAR));
    adhkarTrack.setAttribute('class', 'adhkar-ring-track');
    adhkarTrack.setAttribute('stroke-width', '11');
    adhkarGroup.appendChild(adhkarTrack);

    this.adhkarArcElement = document.createElementNS(NS, 'circle');
    this.adhkarArcElement.setAttribute('cx', String(this.CX));
    this.adhkarArcElement.setAttribute('cy', String(this.CY));
    this.adhkarArcElement.setAttribute('r', String(this.R_ADHKAR));
    this.adhkarArcElement.setAttribute('class', 'adhkar-ring-arc');
    this.adhkarArcElement.setAttribute('stroke', 'url(#mihrabAdhkarGoldGrad)');
    this.adhkarArcElement.setAttribute('stroke-width', '11');
    this.adhkarArcElement.setAttribute('stroke-dasharray', this.C_ADHKAR.toFixed(2));
    this.adhkarArcElement.setAttribute('stroke-dashoffset', this.C_ADHKAR.toFixed(2));
    this.adhkarArcElement.setAttribute('transform', `rotate(-90 ${this.CX} ${this.CY})`);
    this.adhkarArcElement.setAttribute('filter', 'url(#mihrabGoldGlow)');
    adhkarGroup.appendChild(this.adhkarArcElement);

    // 3 Golden Pearl Dividing Pips (Morning, Evening, Night)
    this.adhkarPearlElements = [];
    const pearlAngles = [-90, 30, 150];
    pearlAngles.forEach(deg => {
      const rad = (deg * Math.PI) / 180;
      const px = this.CX + this.R_ADHKAR * Math.cos(rad);
      const py = this.CY + this.R_ADHKAR * Math.sin(rad);

      const pearl = document.createElementNS(NS, 'circle');
      pearl.setAttribute('cx', px.toFixed(2));
      pearl.setAttribute('cy', py.toFixed(2));
      pearl.setAttribute('r', '3');
      pearl.setAttribute('class', 'adhkar-pearl-pip');
      adhkarGroup.appendChild(pearl);
      this.adhkarPearlElements.push(pearl);
    });

    this.svg.appendChild(adhkarGroup);

    // 5. Ring 3: Wird & Tasbih (Inner Ring)
    this.tasbihGroupElement = document.createElementNS(NS, 'g');
    this.tasbihGroupElement.setAttribute('class', 'tasbih-ring-group');

    const tasbihTrack = document.createElementNS(NS, 'circle');
    tasbihTrack.setAttribute('cx', String(this.CX));
    tasbihTrack.setAttribute('cy', String(this.CY));
    tasbihTrack.setAttribute('r', String(this.R_TASBIH));
    tasbihTrack.setAttribute('class', 'tasbih-ring-track');
    tasbihTrack.setAttribute('stroke-width', '9');
    this.tasbihGroupElement.appendChild(tasbihTrack);

    this.tasbihArcElement = document.createElementNS(NS, 'circle');
    this.tasbihArcElement.setAttribute('cx', String(this.CX));
    this.tasbihArcElement.setAttribute('cy', String(this.CY));
    this.tasbihArcElement.setAttribute('r', String(this.R_TASBIH));
    this.tasbihArcElement.setAttribute('class', 'tasbih-ring-arc');
    this.tasbihArcElement.setAttribute('stroke', 'url(#mihrabTasbihArcGrad)');
    this.tasbihArcElement.setAttribute('stroke-width', '9');
    this.tasbihArcElement.setAttribute('stroke-dasharray', this.C_TASBIH.toFixed(2));
    this.tasbihArcElement.setAttribute('stroke-dashoffset', this.C_TASBIH.toFixed(2));
    this.tasbihArcElement.setAttribute('transform', `rotate(-90 ${this.CX} ${this.CY})`);
    this.tasbihGroupElement.appendChild(this.tasbihArcElement);

    // Tasbih Golden Shockwave Ring
    this.tasbihShockwaveElement = document.createElementNS(NS, 'circle');
    this.tasbihShockwaveElement.setAttribute('cx', String(this.CX));
    this.tasbihShockwaveElement.setAttribute('cy', String(this.CY));
    this.tasbihShockwaveElement.setAttribute('r', String(this.R_TASBIH));
    this.tasbihShockwaveElement.setAttribute('class', 'tasbih-shockwave-ring');
    this.tasbihGroupElement.appendChild(this.tasbihShockwaveElement);

    this.svg.appendChild(this.tasbihGroupElement);

    // 6. Center Jewel: Andalusian Khatam & Spiritual Core
    const centerGroup = document.createElementNS(NS, 'g');
    centerGroup.setAttribute('class', 'mihrab-center-jewel');
    centerGroup.style.cursor = 'pointer';
    centerGroup.addEventListener('click', () => this.toggleDisplayMode());

    // Medallion Disc
    const disc = document.createElementNS(NS, 'circle');
    disc.setAttribute('cx', String(this.CX));
    disc.setAttribute('cy', String(this.CY));
    disc.setAttribute('r', '52');
    disc.setAttribute('class', 'center-medallion-disc');
    disc.setAttribute('fill', 'url(#mihrabCenterJewelGrad)');
    centerGroup.appendChild(disc);

    // Inner Concentric Gold Filigree Ring
    const innerRing = document.createElementNS(NS, 'circle');
    innerRing.setAttribute('cx', String(this.CX));
    innerRing.setAttribute('cy', String(this.CY));
    innerRing.setAttribute('r', '46');
    innerRing.setAttribute('class', 'center-filigree-ring');
    centerGroup.appendChild(innerRing);

    // Andalusian 8-Point Geometric Star (Khatam Zellige)
    this.centerKhatamElement = document.createElementNS(NS, 'g');
    this.centerKhatamElement.setAttribute('class', 'center-khatam-geometry');

    const khatamOuter = document.createElementNS(NS, 'polygon');
    khatamOuter.setAttribute('points', this.generateStarPoints(this.CX, this.CY, 42, 28));
    khatamOuter.setAttribute('class', 'khatam-star-outer');

    const khatamInner = document.createElementNS(NS, 'polygon');
    khatamInner.setAttribute('points', this.generateStarPoints(this.CX, this.CY, 24, 16));
    khatamInner.setAttribute('class', 'khatam-star-inner');

    this.centerKhatamElement.appendChild(khatamOuter);
    this.centerKhatamElement.appendChild(khatamInner);
    centerGroup.appendChild(this.centerKhatamElement);

    // Center Metric Display
    this.centerValueText = document.createElementNS(NS, 'text');
    this.centerValueText.setAttribute('x', String(this.CX));
    this.centerValueText.setAttribute('y', String(this.CY + 6));
    this.centerValueText.setAttribute('class', 'center-metric-value');
    this.centerValueText.setAttribute('text-anchor', 'middle');
    this.centerValueText.textContent = '0%';
    centerGroup.appendChild(this.centerValueText);

    this.centerLabelText = document.createElementNS(NS, 'text');
    this.centerLabelText.setAttribute('x', String(this.CX));
    this.centerLabelText.setAttribute('y', String(this.CY + 22));
    this.centerLabelText.setAttribute('class', 'center-metric-label');
    this.centerLabelText.setAttribute('text-anchor', 'middle');
    this.centerLabelText.textContent = 'سَكِينَة';
    centerGroup.appendChild(this.centerLabelText);

    this.centerSubText = document.createElementNS(NS, 'text');
    this.centerSubText.setAttribute('x', String(this.CX));
    this.centerSubText.setAttribute('y', String(this.CY + 33));
    this.centerSubText.setAttribute('class', 'center-metric-sub');
    this.centerSubText.setAttribute('text-anchor', 'middle');
    this.centerSubText.textContent = 'نُورُ البَرَكَة';
    centerGroup.appendChild(this.centerSubText);

    this.svg.appendChild(centerGroup);
  }

  private renderCenterMetric(totalPercent: number): void {
    if (this.displayMode === 'percent') {
      this.centerValueText.textContent = `${totalPercent}%`;
      this.centerLabelText.textContent = 'سَكِينَة';
      this.centerSubText.textContent = totalPercent >= 80 ? 'نُورٌ عَلَىٰ نُور' : 'الورد اليومي';
    } else if (this.displayMode === 'tasbih') {
      this.centerValueText.textContent = `${this.state.tasbihCount}`;
      this.centerLabelText.textContent = 'تَسْبِيح';
      this.centerSubText.textContent = `الهدف ${this.state.tasbihTarget}`;
    } else {
      this.centerValueText.textContent = `${this.state.prayersDone}/5`;
      this.centerLabelText.textContent = 'صَلَوَات';
      this.centerSubText.textContent = this.state.prayersDone === 5 ? 'مكتملة مباركة' : 'قيد الأداء';
    }
  }

  private spawnNoorParticle(): void {
    const particle = document.createElementNS(NS, 'circle');
    const angleRad = (Math.random() * 360 * Math.PI) / 180;
    const startX = this.CX + this.R_TASBIH * Math.cos(angleRad);
    const startY = this.CY + this.R_TASBIH * Math.sin(angleRad);

    particle.setAttribute('cx', startX.toFixed(2));
    particle.setAttribute('cy', startY.toFixed(2));
    particle.setAttribute('r', '2.5');
    particle.setAttribute('class', 'noor-shockwave-particle');

    this.svg.appendChild(particle);

    setTimeout(() => {
      particle.remove();
    }, 600);
  }

  private generateStarPoints(cx: number, cy: number, rOut: number, rIn: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i * 22.5 - 90) * (Math.PI / 180);
      const r = i % 2 === 0 ? rOut : rIn;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return pts.join(' ');
  }

  private describeArc(
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
  ): string {
    const rad = Math.PI / 180;
    const x1 = cx + r * Math.cos(startAngle * rad);
    const y1 = cy + r * Math.sin(startAngle * rad);
    const x2 = cx + r * Math.cos(endAngle * rad);
    const y2 = cy + r * Math.sin(endAngle * rad);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;

    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
}
