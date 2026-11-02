/**
 * Spiritual Progression Hub (منظومة السكينة والبركة)
 *
 * Unifies BOTH sacred progression designs into a single luxury component:
 * 1. Shajarat Al-Hasanat (شجرة الزيتونة المباركة) — Lush 2D Botanical Olive Tree.
 * 2. Mihrab An-Noor (محراب النور وحلقات السكينة) — Celestial Concentric Rings Dial.
 *
 * Allows seamless 1-click toggling between the Botanical Tree and Celestial Dial,
 * persisting the user's choice offline with instant spring response.
 */

import { LushSpiritualTreeWidget, type SpiritualProgress } from './spiritual-tree.js';
import { MihrabNoorWidget } from './mihrab-noor.js';

export type SpiritualViewMode = 'tree' | 'mihrab';

export class SpiritualHubWidget {
  private container: HTMLElement;
  private treeWidget: LushSpiritualTreeWidget;
  private mihrabWidget: MihrabNoorWidget;
  private currentMode: SpiritualViewMode = 'tree';

  private stage: HTMLElement;
  private treePane: HTMLElement;
  private mihrabPane: HTMLElement;
  private btnTree: HTMLButtonElement;
  private btnMihrab: HTMLButtonElement;
  private navBar: HTMLElement;

  constructor(initialProgress: SpiritualProgress, initialMode?: SpiritualViewMode) {
    this.treeWidget = new LushSpiritualTreeWidget(initialProgress);
    this.mihrabWidget = new MihrabNoorWidget();
    this.mihrabWidget.updateFromSpiritualProgress(initialProgress);

    // Load persisted view mode from localStorage or fallback
    try {
      const savedMode = localStorage.getItem('azan.spiritual_view_mode') as SpiritualViewMode | null;
      if (savedMode === 'tree' || savedMode === 'mihrab') {
        this.currentMode = savedMode;
      } else if (initialMode) {
        this.currentMode = initialMode;
      }
    } catch {
      this.currentMode = initialMode ?? 'tree';
    }

    this.container = document.createElement('div');
    this.container.className = 'spiritual-hub-card';

    // 1. Sleek Segmented Switcher Pill
    this.navBar = document.createElement('div');
    this.navBar.className = 'spiritual-hub-nav';
    this.navBar.setAttribute('role', 'tablist');
    this.navBar.setAttribute('aria-label', 'طريقة عرض التقدم الروحي');

    this.btnTree = document.createElement('button');
    this.btnTree.type = 'button';
    this.btnTree.className = `spiritual-hub-btn ${this.currentMode === 'tree' ? 'is-active' : ''}`;
    this.btnTree.setAttribute('role', 'tab');
    this.btnTree.setAttribute('aria-selected', this.currentMode === 'tree' ? 'true' : 'false');
    this.btnTree.innerHTML = `
      <span class="hub-btn-icon" aria-hidden="true">🌿</span>
      <span class="hub-btn-text">شجرة الزيتونة</span>
    `;
    this.btnTree.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setViewMode('tree');
    });

    this.btnMihrab = document.createElement('button');
    this.btnMihrab.type = 'button';
    this.btnMihrab.className = `spiritual-hub-btn ${this.currentMode === 'mihrab' ? 'is-active' : ''}`;
    this.btnMihrab.setAttribute('role', 'tab');
    this.btnMihrab.setAttribute('aria-selected', this.currentMode === 'mihrab' ? 'true' : 'false');
    this.btnMihrab.innerHTML = `
      <span class="hub-btn-icon" aria-hidden="true">⭕</span>
      <span class="hub-btn-text">محراب النور</span>
    `;
    this.btnMihrab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setViewMode('mihrab');
    });

    this.navBar.append(this.btnTree, this.btnMihrab);
    this.container.appendChild(this.navBar);

    // 2. Stage Panes
    this.stage = document.createElement('div');
    this.stage.className = 'spiritual-hub-stage';

    this.treePane = document.createElement('div');
    this.treePane.className = `hub-view-pane ${this.currentMode === 'tree' ? 'is-active' : ''}`;
    this.treePane.appendChild(this.treeWidget.getElement());

    this.mihrabPane = document.createElement('div');
    this.mihrabPane.className = `hub-view-pane ${this.currentMode === 'mihrab' ? 'is-active' : ''}`;
    this.mihrabPane.appendChild(this.mihrabWidget.getElement());

    this.stage.append(this.treePane, this.mihrabPane);
    this.container.appendChild(this.stage);
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public getViewMode(): SpiritualViewMode {
    return this.currentMode;
  }

  public setGoal(goal: number): void {
    this.treeWidget.setGoal(goal);
  }

  public setViewMode(mode: SpiritualViewMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;

    try {
      localStorage.setItem('azan.spiritual_view_mode', mode);
    } catch {
      // Safe sandboxed fallback
    }

    this.btnTree.classList.toggle('is-active', mode === 'tree');
    this.btnTree.setAttribute('aria-selected', mode === 'tree' ? 'true' : 'false');

    this.btnMihrab.classList.toggle('is-active', mode === 'mihrab');
    this.btnMihrab.setAttribute('aria-selected', mode === 'mihrab' ? 'true' : 'false');

    this.treePane.classList.toggle('is-active', mode === 'tree');
    this.mihrabPane.classList.toggle('is-active', mode === 'mihrab');
  }

  /**
   * Updates both visual models simultaneously
   */
  public update(progress: SpiritualProgress, currentSessionCount?: number, tasbihTarget = 33): void {
    this.treeWidget.update(progress, currentSessionCount);
    this.mihrabWidget.updateFromSpiritualProgress(progress, tasbihTarget);
  }

  /**
   * Interactive feedback when tapping Tasbih:
   * Dispatches both the tree's leaf flutter + bud growth + rising Noor spark
   * AND the mihrab's golden shockwave ripple!
   */
  public pulseTapFeedback(touchX?: number, touchY?: number, dhikrText?: string): void {
    this.treeWidget.pulseTapFeedback(touchX, touchY, dhikrText);
    this.mihrabWidget.pulseTasbih();
  }

  /**
   * Alias for backward compatibility
   */
  public pulseTasbihSeed(): void {
    this.pulseTapFeedback();
  }

  /**
   * Allows tapping directly on the visual stage (tree or mihrab) to count Tasbih
   */
  public onStageTap(callback: (e: MouseEvent) => void): void {
    this.stage.style.cursor = 'pointer';
    this.stage.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      // Do not trigger counter if user is interacting with the fiche button or close button or legend pill
      if (target && target.closest('.fiche-signal-btn, .mihrab-fiche-panel, .legend-pill, .fiche-close-btn')) {
        return;
      }
      callback(e);
    });
  }
}
