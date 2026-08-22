import { Extension, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { filterSlashItems, type SlashItem } from './slashItems';

export type SlashMenuState = {
  items: SlashItem[];
  range: Range;
  clientRect: DOMRect | null;
};

export type SlashCommandOptions = {
  /** Called when the menu opens or its query changes. */
  onStateChange: (state: SlashMenuState | null) => void;
  /**
   * Lets the menu component consume arrow keys and Enter while it is open.
   * Returns true when the key was handled.
   */
  onKeyDown: (event: KeyboardEvent) => boolean;
};

/**
 * Slash commands.
 *
 * The extension owns matching and positioning, and hands the resulting state to
 * React through callbacks instead of rendering its own DOM. That keeps the menu
 * a normal component that can be styled and tested like any other.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onStateChange: () => {},
      onKeyDown: () => false,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        // Only offer commands at the start of an empty-ish block, so typing a
        // slash mid-sentence (URLs, dates, and/or) does not open the menu.
        allowedPrefixes: [' '],
        startOfLine: true,
        items: ({ query }) => filterSlashItems(query),
        // Selection is driven by the React menu, which calls `item.run` with the
        // range from the emitted state and the picker callbacks it owns. This
        // hook is required by the plugin but never invoked.
        command: () => {},
        render: () => ({
          onStart: props => {
            options.onStateChange({
              items: props.items,
              range: props.range,
              clientRect: props.clientRect?.() ?? null,
            });
          },
          onUpdate: props => {
            options.onStateChange({
              items: props.items,
              range: props.range,
              clientRect: props.clientRect?.() ?? null,
            });
          },
          onKeyDown: ({ event }) => options.onKeyDown(event),
          onExit: () => {
            options.onStateChange(null);
          },
        }),
      } as SuggestionOptions<SlashItem>),
    ];
  },
});
