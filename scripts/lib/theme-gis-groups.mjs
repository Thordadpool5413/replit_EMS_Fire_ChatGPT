export const GIS_THEMES = ['daylight', 'dark', 'miami-vice'];
export const GIS_LAYERS = ['ohca', 'survival', 'aed', 'transport'];
export const GIS_CHECKS = ['legend', 'kde', 'hexbin', 'choropleth'];

function select(env, name, allowed, defaults = allowed) {
  if (env[name] === undefined) return defaults;
  const values = [...new Set(env[name].split(',').map((value) => value.trim()))];
  if (values.some((value) => !allowed.includes(value))) {
    throw new Error(`${name} must contain comma-separated values from: ${allowed.join(', ')}`);
  }
  return values;
}

export function planGisGroups(env = process.env) {
  const themes = select(env, 'THEME_GIS_THEMES', GIS_THEMES, ['daylight', 'dark']);
  const layers = select(env, 'THEME_GIS_LAYERS', GIS_LAYERS);
  const riskOnly = env.THEME_GIS_ONLY !== '1' && env.THEME_GIS_RISK_ONLY === '1';
  const checks = select(env, 'THEME_GIS_CHECKS', riskOnly ? GIS_CHECKS.slice(1) : GIS_CHECKS);
  const groups = themes.flatMap((theme) => layers.flatMap((layer) =>
    checks.filter((check) => layer !== 'ohca' || check === 'legend')
      .map((check) => ({ id: `${theme}:${layer}:${check}`, theme, layer, check }))));
  if (!groups.length) throw new Error('No GIS groups match the selected layers and checks. OHCA supports legend checks only.');
  return groups;
}

export function gisGroupTimeout(env = process.env) {
  const value = Number(env.THEME_GIS_GROUP_TIMEOUT_MS ?? 90_000);
  if (!Number.isFinite(value) || value <= 0 || value > 240_000) {
    throw new Error('THEME_GIS_GROUP_TIMEOUT_MS must be greater than 0 and at most 240000.');
  }
  return value;
}
