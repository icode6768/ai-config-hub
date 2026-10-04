import z from '@deepseek-ai/schemastery';
import { bootThemeInjections } from "./boot-theme.js";
import { DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, FONT_SIZE_MIN, FONT_SIZE_MAX, THEME_PREFERENCES, } from "./theme-settings.js";
export { DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, FONT_SIZE_FIELD, FONT_SIZE_MAX, FONT_SIZE_MIN, THEME_PREFERENCE_FIELD, THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE, } from "./theme-settings.js";
/** Live theme and typography preferences. */
export const Config = z.object({
    preference: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE).volatile(),
    fontSize: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE).volatile(),
});
/** Supply the current palette before browser plugins start.
 * @param ctx Host plugin context.
 * @param config Validated live theme preferences.
 */
export function apply(ctx, config) {
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
    ctx.on('webserver/index-inject', (table) => {
        table.push(...bootThemeInjections(config.preference.get(), config.fontSize.get()));
    }, { prepend: true });
}
//# sourceMappingURL=index.js.map