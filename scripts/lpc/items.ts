/**
 * Lists the generator's pieces with what a recipe needs: the selection key,
 * the variants or recolor colors, the body types and the animations.
 *
 *   npm run lpc:items -- <term>… [--body female]
 *   npm run lpc:items -- hair long --body female
 */
import { loadCatalog, searchItems, type CatalogItem } from './catalog';

interface Query {
  terms: string[];
  bodyType?: string;
}

function parseArgs(args: readonly string[]): Query {
  const bodyIndex = args.indexOf('--body');
  const bodyType = bodyIndex >= 0 ? args[bodyIndex + 1] : undefined;
  if (bodyIndex >= 0 && bodyType === undefined) throw new Error('--body needs a body type');
  const terms = args.filter((_, index) => index !== bodyIndex && index !== bodyIndex + 1);
  return bodyType === undefined ? { terms } : { terms, bodyType };
}

function describe(item: CatalogItem): string {
  const lines = [
    `${item.id}  "${item.name}"  → selections.${item.typeName}  [${item.category.join('/')}]`,
    `  bodies: ${item.bodyTypes.join(', ')}`,
    `  animations: ${item.animations.join(', ')}`,
  ];
  if (item.variants.length > 0) lines.push(`  variant: ${item.variants.join(', ')}`);
  item.recolors.forEach((recolor, subId) => {
    const where =
      recolor.typeName === null ? '' : ` → selections.${recolor.typeName}, subId ${subId}`;
    lines.push(`  recolor (${recolor.label}${where}): ${recolor.colors.join(', ')}`);
  });
  return lines.join('\n');
}

async function main(): Promise<void> {
  const query = parseArgs(process.argv.slice(2));
  const catalog = await loadCatalog();
  if (query.bodyType !== undefined && !catalog.bodyTypes.includes(query.bodyType)) {
    throw new Error(
      `body type "${query.bodyType}" does not exist; options: ${catalog.bodyTypes.join(', ')}`,
    );
  }
  const items = searchItems(catalog, query.terms, query.bodyType);
  console.info(items.map(describe).join('\n\n'));
  console.info(`\n[lpc] ${items.length} item(s) of ${catalog.items.size}`);
}

try {
  await main();
} catch (error) {
  console.error(`[lpc] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
