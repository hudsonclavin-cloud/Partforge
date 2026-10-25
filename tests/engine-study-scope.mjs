// What the Engine Design Study page may contain, in one place. tests/engine-study.test.mjs checks the
// page's source against it; tests/harness/engine-study.mjs checks the text the browser actually
// renders. These are tripwires for the direct regressions, not a proof of scope: a sentence can say
// something it should not in words none of these lists contain, so the prose is still for review.

// Every number in the page's prose must be one of these. Any other number is new, and a person has
// to look at it: approving it means adding it here, on purpose, with a comment saying what it is.
export const ALLOWED_NUMBERS = [
  /\bLEAP 71\b/g,                                              // the company's name
  /\b(?:19|20)\d\d\b/g,                                        // years (a unit after one is still caught below)
  /\b(?:SP-125|RP-1311|TB-26-04|CEA v3|CEA2|Apache-2\.0)\b/g,  // document, release and licence names
  /\bL-\d\d\b/g,                                               // ledger row ids
];
export function strayNumbers(text){
  let t = String(text);
  for(const re of ALLOWED_NUMBERS) t = t.replace(re, ' ');
  return [...t.matchAll(/.{0,30}\d.{0,30}/g)].map(m => m[0].replace(/\s+/g, ' ').trim());
}

// A number followed by a unit is a dimension, a load, a rate or a setpoint. Checked everywhere,
// including the script, where the number allowlist cannot run (code is full of numbers).
const UNIT = String.raw`(?:kN|MN|N|lbf|lbm|lbs?|kg|g|bar|mbar|atm|psi[ag]?|Pa|kPa|MPa|GPa|K|°[CFR]|deg[CFR]?|mm|cm|µm|um|m|in|inch(?:es)?|ft|s|sec|ms|Hz|kHz|rpm|W|kW|MW|J|kJ|MJ|L|mL|kg\/s|g\/s|lb\/s|m\/s|ft\/s|%)`;
export const NUMBER_WITH_UNIT = new RegExp(String.raw`\d(?:[\d.,]*\d)?[ \u00a0]?${UNIT}(?![\w/])`, 'g');   // same line only
// Units spelled out, with or without a number, and numbers spelled out in front of a unit.
export const UNIT_WORDS = /\b(?:newtons?|kilonewtons?|meganewtons?|pounds?[- ]force|pascals?|kilopascals?|megapascals?|atmospheres|kelvins?|celsius|fahrenheit|millimet(?:er|re)s|centimet(?:er|re)s|inches|kilograms? per second)\b/i;
export const NUMBER_WORD_UNIT = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million)\b[\s-]+(?:\w+[\s-]+)?(?:seconds|bar|atmospheres?|psi|newtons?|kilonewtons?|degrees|kelvins?|millimet(?:er|re)s?|inch(?:es)?|kilograms?|pounds?|percent)\b/i;

// Engine quantities next to a number, in either order. Catches a value given without a unit.
export const ENGINE_TERM_NEAR_NUMBER = /(?:specific impulse|\bIsp\b|mixture ratio|\bO\/F\b|chamber pressure|expansion ratio|area ratio|contraction ratio|\bthrust\b|mass flow|flow rate|\bthroat\b|characteristic velocity|\bc\*|\bL\*|burn time|total impulse|exit pressure|flame temperature|injector drop|pressure drop)[^.\n]{0,30}\d|\d[^.\n]{0,30}(?:specific impulse|\bIsp\b|mixture ratio|\bO\/F\b|chamber pressure|expansion ratio|area ratio|\bthrust\b|mass flow|flow rate|\bthroat\b|burn time|total impulse)/i;

// Generic on purpose: no propellant, oxidizer or fuel is named anywhere. Acronyms are case-sensitive.
export const PROPELLANT_NAMES = /\b(?:LOX|GOX|LH2|GH2|LCH4|LNG|RP-1|JP-\d+|Jet-A1?|MMH|UDMH|N2O4?|NTO|H2O2|HTP|HTPB|IRFNA|WFNA|RFNA|ADN|HAN|LMP-103S|KNSB|KNO3|IPA|CH4|H2|O2)\b|\b(?:oxygen|hydrogen|kerosene|methane|propane|butane|ethane|ethanol|methanol|isopropanol|alcohol|gasoline|petrol|diesel|paraffin|turpentine|aniline|furfuryl|hydrazine|nitrous|nitromethane|nitric acid|peroxide|perchlorate|ammonium nitrate|potassium nitrate|black powder|sorbitol|aluminium powder|aluminum powder|fluorine|chlorine trifluoride)\b/i;

// Build or test instructions aimed at engine hardware. A heuristic: it catches the plain imperative
// form ("torque the bolts", "fill the tank", "Step 1"), not every way of writing instructions.
export const BUILD_INSTRUCTION = /\b(?:print|machine|drill|tap|weld|braze|torque|tighten|assemble|install|fill|load|chill|purge|pressuri[sz]e|ignite|fire|light)\s+(?:the\s+|an?\s+|its\s+|your\s+)?(?:chamber|nozzle|injector|engine|motor|tank|igniter|manifold|bolts?|propellants?|oxidi[sz]er|fuel|valves?|feed ?lines?|cooling channels?|regen)\b|\bstep\s+\d/i;

// Words that say a claim was proven. Allowed only negated ("not validated on hardware").
export const PROVEN = /\b(?:validated|qualified|certified|flight[- ](?:ready|proven|qualified)|approved|safe to (?:fly|fire|build|test))\b/i;
export const withoutNegations = t => String(t).replace(/\bnot\s+(?:yet\s+)?(?:been\s+)?(?:validated|qualified|certified|approved)\b/gi, ' ');

// Text that marks a ledger row as an AI's output, whatever the model is called.
export const ASSISTANT_TERMS = /\b(?:LLM|AI|language model|assistant|chat ?bot|copilot|agent|GPT|Claude|Gemini|model summary)\b/i;

// Boxes on the map that PartForge has nothing like, and must say so.
export const PROPULSION_BOXES = ['orch', 'thermo', 'flow', 'thermal', 'test'];

// Every check that reads prose runs these over it; a list of {name, hits} comes back.
export function proseViolations(text){
  const out = [];
  const t = String(text);
  const hit = (name, re) => { const m = t.match(re); if(m) out.push({ name, hit: m[0] }); };
  const units = t.match(NUMBER_WITH_UNIT); if(units) out.push({ name: 'number with a unit', hit: units.join(' | ') });
  hit('unit spelled out', UNIT_WORDS);
  hit('number spelled out before a unit', NUMBER_WORD_UNIT);
  hit('engine quantity next to a number', ENGINE_TERM_NEAR_NUMBER);
  hit('propellant named', PROPELLANT_NAMES);
  hit('build or test instruction', BUILD_INSTRUCTION);
  return out;
}
