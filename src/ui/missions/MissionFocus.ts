import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import type { GameState, Mission, Npc } from '../../model/schema';
import type { GameStore } from '../../store';
import { toBronze } from '../../systems/Coins';
import {
  canGoOnMission,
  expectedPayout,
  guildBonusPercent,
  splitReward,
} from '../../systems/Missions';
import { findPost, skillOf } from '../../systems/Npcs';
import { renderMarkdown } from '../archive/markdownView';
import { el } from '../dom';
import { formatCoins, formatGold } from '../format';
import type { MasterAccess } from '../MasterSession';
import { button, confirmButton, type Act } from '../widgets';
import { fieldLine, missionForm, waxSeal } from './missionViews';
import { scrollLook } from './scrollLook';

export interface MissionDeps {
  game: GameStore;
  session: MasterAccess;
  act: Act;
}

/** Skills listed next to an NPC in the picker. */
const TOP_SKILLS = 3;

type Mode =
  | { kind: 'view' }
  /** Built once and kept across redraws, so typing is never lost. */
  | { kind: 'edit'; node: HTMLElement }
  | { kind: 'send'; picked: Set<string> };

/**
 * One mission brought to the front: the scroll grows to the middle of the
 * screen over the darkened board, with the full text and the actions its
 * stage allows. Esc, the X or a click outside closes it.
 */
export class MissionFocus {
  private dialog: HTMLDialogElement | null = null;
  private missionId: string | null = null;
  private mode: Mode = { kind: 'view' };
  private readonly injured = new Set<string>();
  private readonly scroll = el('article', { class: 'mission-scroll mission-focus' });

  constructor(private readonly deps: MissionDeps) {}

  open(missionId: string): void {
    this.missionId = missionId;
    this.mode = { kind: 'view' };
    this.injured.clear();
    if (!this.dialog) this.dialog = this.buildDialog();
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  close(): void {
    this.dialog?.close();
  }

  /** Redraws after any change; closes when the mission is gone. */
  render(): void {
    if (!this.dialog) return;
    const mission = this.deps.game.current.missions.find((m) => m.id === this.missionId);
    if (!mission) return this.close();
    if (mission.progress.status !== 'aberta' && this.mode.kind !== 'view') {
      this.mode = { kind: 'view' };
    }
    const look = scrollLook(mission.id);
    this.scroll.className = `mission-scroll mission-scroll--${look.paper} mission-focus`;
    this.scroll.replaceChildren(
      el('span', {
        class: 'mission-scroll__roll mission-scroll__roll--top',
        'aria-hidden': 'true',
      }),
      el(
        'div',
        { class: 'mission-scroll__paper mission-focus__paper' },
        el(
          'button',
          {
            class: 'btn btn--icon mission-focus__close',
            type: 'button',
            'aria-label': t.missions.closeFocus,
            onclick: () => this.close(),
          },
          '×',
        ),
        ...(this.mode.kind === 'edit' ? [this.mode.node] : this.details(mission)),
      ),
      el('span', {
        class: 'mission-scroll__roll mission-scroll__roll--bottom',
        'aria-hidden': 'true',
      }),
      waxSeal(mission.difficulty),
    );
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--mission', 'aria-label': t.missions.title },
      this.scroll,
    );
    // Esc closes only this scroll: the board and the slot panel behind stay open.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    // The dialog box is the scroll itself, so a click on the dialog is on the backdrop.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      this.dialog = null;
      this.missionId = null;
    });
    document.body.append(dialog);
    return dialog;
  }

  private get isMaster(): boolean {
    return this.deps.session.isActive;
  }

  private details(mission: Mission): (HTMLElement | null)[] {
    const { catalog, current: state } = this.deps.game;
    return [
      el('p', { class: 'mission-focus__status' }, t.missions.status[mission.progress.status]),
      el('h2', { class: 'mission-scroll__title mission-focus__title' }, mission.title),
      fieldLine(t.missions.requester, mission.requester),
      fieldLine(t.missions.location, mission.location),
      mission.description.trim()
        ? el(
            'div',
            { class: 'mission-scroll__line' },
            el('span', { class: 'mission-scroll__label' }, `${t.missions.description}:`),
            renderMarkdown(mission.description),
          )
        : null,
      fieldLine(t.missions.reward, formatCoins(catalog, mission.reward)),
      el('p', { class: 'mission-scroll__line' }, t.missions.expected(mission.days)),
      el(
        'p',
        { class: 'mission-focus__meta' },
        `${t.missions.difficulties[mission.difficulty]} · ${t.missions.createdBy(mission.createdBy, mission.createdOnDay)}`,
      ),
      this.bonusLine(state, catalog, mission),
      el('div', { class: 'mission-focus__actions' }, ...this.stage(state, catalog, mission)),
    ];
  }

  private bonusLine(state: GameState, catalog: Catalog, mission: Mission): HTMLElement | null {
    const percent = guildBonusPercent(state, catalog);
    if (percent === 0 || mission.progress.status === 'concluida') return null;
    const total = splitReward(toBronze(mission.reward, catalog.currencies), {
      bonusPercent: percent,
      npcCount: 0,
      commissionPercent: 0,
    }).totalBronze;
    return el(
      'p',
      { class: 'mission-focus__bonus' },
      t.missions.guildBonus(percent, formatGold(catalog, total)),
    );
  }

  /** What can be done at this stage of the mission. */
  private stage(state: GameState, catalog: Catalog, mission: Mission): (HTMLElement | null)[] {
    const { progress } = mission;
    const gold = (bronze: number) => formatGold(catalog, bronze);
    switch (progress.status) {
      case 'aberta':
        return this.mode.kind === 'send'
          ? this.npcPicker(state, catalog, mission, this.mode.picked)
          : this.openActions(mission);
      case 'grupo':
        return [
          el('p', {}, t.missions.partyAway(progress.startedOnDay)),
          this.isMaster
            ? el(
                'div',
                { class: 'row row--wrap' },
                button(t.missions.success, () => this.resolve(mission, 'sucesso'), {
                  primary: true,
                }),
                button(t.missions.failure, () => this.resolve(mission, 'falha')),
              )
            : el('p', { class: 'panel__hint' }, t.missions.partyHint),
        ];
      case 'npcs':
        return [
          el(
            'p',
            {},
            t.missions.npcsAway(
              teamNames(state, progress.npcIds),
              progress.returnsOnDay,
              progress.returnsOnDay - state.day,
            ),
          ),
          this.splitLine(state, catalog, mission),
        ];
      case 'aguardando':
        return [
          el('p', {}, t.missions.npcsBack(teamNames(state, progress.npcIds))),
          this.splitLine(state, catalog, mission),
          ...(this.isMaster
            ? this.npcVerdict(state, mission, progress.npcIds)
            : [el('p', { class: 'panel__hint' }, t.missions.waitMaster)]),
        ];
      case 'concluida':
        return [
          el(
            'p',
            {},
            progress.by === 'grupo'
              ? t.missions.resultParty(progress.result, gold(progress.campBronze))
              : t.missions.resultNpcs(
                  progress.result,
                  gold(progress.npcBronze),
                  gold(progress.campBronze),
                ),
          ),
          progress.npcs.length > 0
            ? el('p', { class: 'card__sub' }, t.missions.team(progress.npcs.join(', ')))
            : null,
          progress.injured.length > 0
            ? el('p', { class: 'card__sub' }, t.missions.hurt(progress.injured.join(', ')))
            : null,
          el('p', { class: 'card__sub' }, t.missions.resolvedOn(progress.resolvedOnDay)),
        ];
      default:
        return assertNever(progress);
    }
  }

  private openActions(mission: Mission): HTMLElement[] {
    const { act, game } = this.deps;
    const missionId = mission.id;
    return [
      el(
        'div',
        { class: 'row row--wrap' },
        button(t.missions.takeParty, () => void act({ type: 'mission_take_party', missionId }), {
          primary: true,
        }),
        button(t.missions.sendNpcs, () => this.setMode({ kind: 'send', picked: new Set() })),
      ),
      el(
        'div',
        { class: 'row row--wrap' },
        button(t.missions.editMission, () =>
          this.setMode({
            kind: 'edit',
            node: missionForm({
              catalog: game.catalog,
              mission,
              onCancel: () => this.setMode({ kind: 'view' }),
              onSubmit: (fields) => {
                const done = act({ type: 'mission_update', missionId, ...fields });
                if (done) this.setMode({ kind: 'view' });
                return done;
              },
            }),
          }),
        ),
        confirmButton(t.common.remove, () => void act({ type: 'mission_remove', missionId })),
      ),
    ];
  }

  /** Every NPC with skills, status and workplace; only available or working ones can go. */
  private npcPicker(
    state: GameState,
    catalog: Catalog,
    mission: Mission,
    picked: Set<string>,
  ): HTMLElement[] {
    if (state.npcs.length === 0) {
      return [
        el('p', { class: 'panel__hint' }, t.missions.noNpcs),
        button(t.common.cancel, () => this.setMode({ kind: 'view' })),
      ];
    }
    const payout = splitReward(toBronze(mission.reward, catalog.currencies), {
      bonusPercent: guildBonusPercent(state, catalog),
      npcCount: Math.max(1, picked.size),
      commissionPercent: catalog.missions.campCommissionPercent,
    });
    const send = () =>
      this.deps.act({ type: 'mission_send_npcs', missionId: mission.id, npcIds: [...picked] });
    return [
      el('h3', { class: 'section-title' }, t.missions.chooseNpcs),
      el(
        'ul',
        { class: 'mission-npcs' },
        ...state.npcs.map((npc) => this.npcOption(state, catalog, npc, picked)),
      ),
      el(
        'p',
        { class: 'card__sub' },
        t.missions.npcSplit(
          catalog.missions.campCommissionPercent,
          formatGold(catalog, payout.perNpcBronze),
          formatGold(catalog, payout.campBronze),
        ),
      ),
      el(
        'div',
        { class: 'row row--end' },
        button(t.common.cancel, () => this.setMode({ kind: 'view' })),
        button(t.missions.send(picked.size), send, { primary: true, disabled: picked.size === 0 }),
      ),
    ];
  }

  private npcOption(state: GameState, catalog: Catalog, npc: Npc, picked: Set<string>) {
    const canGo = canGoOnMission(npc);
    const box = el('input', {
      type: 'checkbox',
      checked: picked.has(npc.id),
      disabled: !canGo,
    });
    box.addEventListener('change', () => {
      if (box.checked) picked.add(npc.id);
      else picked.delete(npc.id);
      this.render();
    });
    const post = npc.job && findPost(state, catalog, npc.job);
    const place = post
      ? t.missions.worksAt(catalog.buildings.find((b) => b.id === post.buildingId)?.name ?? '')
      : t.missions.noPost;
    const skills = catalog.skills
      .map((skill) => ({ skill, level: skillOf(npc, skill.id) }))
      .filter(({ level }) => level > 0)
      .sort((a, b) => b.level - a.level)
      .slice(0, TOP_SKILLS)
      .map(({ skill, level }) => `${skill.icon} ${skill.name} ${level}`)
      .join(', ');
    return el(
      'li',
      {},
      el(
        'label',
        { class: `mission-npc${canGo ? '' : ' mission-npc--away'}` },
        box,
        el(
          'span',
          {},
          el('strong', {}, npc.name),
          npc.title && ` · ${npc.title}`,
          el(
            'span',
            { class: 'mission-npc__info' },
            [skills, t.npcs.statuses[npc.status], place].filter(Boolean).join(' · '),
          ),
        ),
      ),
    );
  }

  private splitLine(state: GameState, catalog: Catalog, mission: Mission): HTMLElement {
    const payout = expectedPayout(state, catalog, mission);
    return el(
      'p',
      { class: 'card__sub' },
      t.missions.npcSplit(
        catalog.missions.campCommissionPercent,
        formatGold(catalog, payout.perNpcBronze),
        formatGold(catalog, payout.campBronze),
      ),
    );
  }

  /** Master: success, or failure with the NPCs that come back hurt. */
  private npcVerdict(state: GameState, mission: Mission, npcIds: readonly string[]): HTMLElement[] {
    const team = state.npcs.filter((npc) => npcIds.includes(npc.id));
    return [
      el(
        'fieldset',
        { class: 'mission-injured' },
        el('legend', {}, t.missions.injured),
        ...team.map((npc) => {
          const box = el('input', { type: 'checkbox', checked: this.injured.has(npc.id) });
          box.addEventListener('change', () => {
            if (box.checked) this.injured.add(npc.id);
            else this.injured.delete(npc.id);
          });
          return el('label', { class: 'row' }, box, npc.name);
        }),
      ),
      el(
        'div',
        { class: 'row row--wrap' },
        button(t.missions.npcSuccess, () => this.resolve(mission, 'sucesso'), { primary: true }),
        button(t.missions.npcFailure, () => this.resolve(mission, 'falha')),
      ),
    ];
  }

  private resolve(mission: Mission, result: 'sucesso' | 'falha'): void {
    this.deps.act({
      type: 'mission_resolve',
      missionId: mission.id,
      result,
      injuredNpcIds: result === 'falha' ? [...this.injured] : [],
    });
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.render();
  }
}

function teamNames(state: GameState, npcIds: readonly string[]): string[] {
  return npcIds.flatMap((id) => state.npcs.find((npc) => npc.id === id)?.name ?? []);
}

function assertNever(value: never): never {
  throw new Error(`unhandled mission stage: ${JSON.stringify(value)}`);
}
