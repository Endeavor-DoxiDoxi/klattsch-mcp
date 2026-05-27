#!/usr/bin/env node
/**
 * klattsch-mcp — MCP server for klattsch formant speech synthesis.
 *
 * Exposes klattsch to any AI model via the Model Context Protocol.
 * Tools: speak, speak_file, text_to_phonemes, list_phonemes, validate
 *
 * Transport: stdio (Claude Desktop, Claude Code, Cursor, OpenClaw, etc.)
 *
 * Quick start:
 *   npm install
 *   node src/index.js
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "klattsch": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/klattsch-mcp/src/index.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { compileString, encodeWav, FormantSynth, PHONEME_KEYS } from 'klattsch';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function renderToWavBase64(utterance, sampleRate = 22050) {
  const { schedule, totalMs, warnings } = compileString(utterance);
  if (!schedule || schedule.length === 0) {
    throw new Error('klattsch produced an empty schedule — check your phoneme string.');
  }
  const synth = new FormantSynth({ sampleRate, schedule });
  const numSamples = Math.ceil(totalMs * sampleRate / 1000);
  const buf = new Float32Array(numSamples);
  synth.process(buf);
  const { bytes } = encodeWav(buf, sampleRate);
  const base64 = Buffer.from(bytes).toString('base64');
  return { base64, durationMs: Math.round(totalMs), warnings: warnings ?? [] };
}

function renderToWavFile(utterance, filePath, sampleRate = 22050) {
  const { base64, durationMs, warnings } = renderToWavBase64(utterance, sampleRate);
  const bytes = Buffer.from(base64, 'base64');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return { filePath, byteLength: bytes.length, durationMs, warnings };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGLISH → ARPABET DICTIONARY (expanded)
// ═══════════════════════════════════════════════════════════════════════════════

const WORD_MAP = {
  // Articles / determiners
  a: 'AH', an: 'AE N', the: 'DH AH', this: 'DH IH S', that: 'DH AE T',
  these: 'DH IY Z', those: 'DH OW Z', some: 'S AH M', any: 'EH N IY',
  every: 'EH V R IY', each: 'IY CH', all: 'AO L', both: 'B OW TH',

  // Pronouns
  i: 'AY', me: 'M IY', my: 'M AY', mine: 'M AY N', myself: 'M AY S EH L F',
  you: 'Y UW', your: 'Y AO R', yours: 'Y AO R Z', yourself: 'Y AO R S EH L F',
  he: 'HH IY', him: 'HH IH M', his: 'HH IH Z', himself: 'HH IH M S EH L F',
  she: 'SH IY', her: 'HH ER', hers: 'HH ER Z', herself: 'HH ER S EH L F',
  it: 'IH T', its: 'IH T S', itself: 'IH T S EH L F',
  we: 'W IY', us: 'AH S', our: 'AW R', ours: 'AW R Z', ourselves: 'AW R S EH L V Z',
  they: 'DH EY', them: 'DH EH M', their: 'DH EH R', theirs: 'DH EH R Z',
  themselves: 'DH EH M S EH L V Z',
  who: 'HH UW', whom: 'HH UW M', whose: 'HH UW Z',
  what: 'W AH T', which: 'W IH CH', whatever: 'W AH T EH V ER',

  // To be / to have
  is: 'IH Z', am: 'AE M', are: 'AA R', was: 'W AH Z', were: 'W ER',
  be: 'B IY', been: 'B IH N', being: 'B IY IH NG',
  have: 'HH AE V', has: 'HH AE Z', had: 'HH AE D', having: 'HH AE V IH NG',
  do: 'D UW', does: 'D AH Z', did: 'D IH D', done: 'D AH N', doing: 'D UW IH NG',
  will: 'W IH L', would: 'W UH D', shall: 'SH AE L', should: 'SH UH D',
  can: 'K AE N', could: 'K UH D', may: 'M EY', might: 'M AY T',
  must: 'M AH S T', ought: 'AO T',

  // Negation
  not: 'N AO T', no: 'N OW', never: 'N EH V ER', nothing: 'N AH TH IH NG',
  nobody: 'N OW B AH D IY', nowhere: 'N OW W EH R',

  // Yes / no / greetings
  yes: 'Y EH S', yeah: 'Y AE', yep: 'Y EH P', nope: 'N OW P',
  hello: 'HH AH L OW', hi: 'HH AY', hey: 'HH EY', howdy: 'HH AW D IY',
  goodbye: 'G UH D B AY', bye: 'B AY', later: 'L EY T ER',
  please: 'P L IY Z', thanks: 'TH AE NG K S', 'thank': 'TH AE NG K',
  welcome: 'W EH L K AH M', sorry: 'S AO R IY', excuse: 'EH K S K Y UW Z',
  alright: 'AO L R AY T', okay: 'OW K EY', ok: 'OW K EY',
  morning: 'M AO R N IH NG', afternoon: 'AE F T ER N UW N',
  evening: 'IY V N IH NG', night: 'N AY T', today: 'T AH D EY',
  tomorrow: 'T AH M AO R OW', yesterday: 'Y EH S T ER D EY',

  // Common verbs
  get: 'G EH T', got: 'G AO T', make: 'M EY K', take: 'T EY K',
  give: 'G IH V', come: 'K AH M', came: 'K EY M', go: 'G OW',
  went: 'W EH N T', gone: 'G AO N', see: 'S IY', saw: 'S AO',
  seen: 'S IY N', look: 'L UH K', think: 'TH IH NG K', thought: 'TH AO T',
  know: 'N OW', knew: 'N UW', want: 'W AO N T', need: 'N IY D',
  like: 'L AY K', love: 'L AH V', hate: 'HH EY T',
  say: 'S EY', said: 'S EH D', tell: 'T EH L', told: 'T OW L D',
  ask: 'AE S K', answer: 'AE N S ER', hear: 'HH IH R', heard: 'HH ER D',
  listen: 'L IH S AH N', feel: 'F IY L', felt: 'F EH L T',
  try: 'T R AY', tried: 'T R AY D', help: 'HH EH L P',
  let: 'L EH T', put: 'P UH T', set: 'S EH T',
  run: 'R AH N', ran: 'R AE N', walk: 'W AO K', talk: 'T AO K',
  eat: 'IY T', drink: 'D R IH NG K', sleep: 'S L IY P',
  read: 'R EH D', write: 'R AY T', call: 'K AO L',
  find: 'F AY N D', found: 'F AW N D', lose: 'L UW Z', lost: 'L AO S T',
  start: 'S T AA R T', stop: 'S T AA P', begin: 'B IH G IH N',
  end: 'EH N D', finish: 'F IH N IH SH', keep: 'K IY P',
  open: 'OW P AH N', close: 'K L OW Z', move: 'M UW V',
  turn: 'T ER N', change: 'CH EY N JH', wait: 'W EY T',
  happen: 'HH AE P AH N', mean: 'M IY N', seem: 'S IY M',
  show: 'SH OW', bring: 'B R IH NG', send: 'S EH N D',
  buy: 'B AY', sell: 'S EH L', pay: 'P EY', cost: 'K AO S T',
  work: 'W ER K', play: 'P L EY', live: 'L IH V', die: 'D AY',
  kill: 'K IH L', fight: 'F AY T', win: 'W IH N', won: 'W AH N',
  lose: 'L UW Z', break: 'B R EY K', fix: 'F IH K S',
  build: 'B IH L D', destroy: 'D IH S T R OY',
  remember: 'R IH M EH M B ER', forget: 'F AO R G EH T',
  believe: 'B IH L IY V', hope: 'HH OW P', wish: 'W IH SH',
  dream: 'D R IY M', imagine: 'IH M AE JH AH N',
  learn: 'L ER N', teach: 'T IY CH', study: 'S T AH D IY',
  understand: 'AH N D ER S T AE N D', explain: 'EH K S P L EY N',
  sing: 'S IH NG', sang: 'S AE NG', song: 'S AO NG',
  dance: 'D AE N S', laugh: 'L AE F', cry: 'K R AY', smile: 'S M AY L',
  shout: 'SH AW T', whisper: 'W IH S P ER', scream: 'S K R IY M',
  sit: 'S IH T', stand: 'S T AE N D', fall: 'F AO L', rise: 'R AY Z',
  push: 'P UH SH', pull: 'P UH L', throw: 'TH R OW', catch: 'K AE CH',
  hit: 'HH IH T', kick: 'K IH K', jump: 'JH AH M P', fly: 'F L AY',
  swim: 'S W IH M', drive: 'D R AY V', ride: 'R AY D',

  // Common nouns
  time: 'T AY M', day: 'D EY', week: 'W IY K', month: 'M AH N TH',
  year: 'Y IH R', world: 'W ER L D', life: 'L AY F', death: 'D EH TH',
  people: 'P IY P AH L', person: 'P ER S AH N', man: 'M AE N',
  men: 'M EH N', woman: 'W UH M AH N', women: 'W IH M AH N',
  child: 'CH AY L D', children: 'CH IH L D R AH N',
  friend: 'F R EH N D', family: 'F AE M AH L IY',
  name: 'N EY M', thing: 'TH IH NG', stuff: 'S T AH F',
  way: 'W EY', place: 'P L EY S', home: 'HH OW M', house: 'HH AW S',
  room: 'R UW M', door: 'D AO R', window: 'W IH N D OW',
  water: 'W AO T ER', fire: 'F AY R', air: 'EH R', earth: 'ER TH',
  sun: 'S AH N', moon: 'M UW N', star: 'S T AA R', sky: 'S K AY',
  light: 'L AY T', dark: 'D AA R K', color: 'K AH L ER',
  head: 'HH EH D', face: 'F EY S', hand: 'HH AE N D',
  eye: 'AY', ear: 'IH R', mouth: 'M AW TH', nose: 'N OW Z',
  heart: 'HH AA R T', mind: 'M AY N D', body: 'B AA D IY',
  food: 'F UW D', money: 'M AH N IY', work: 'W ER K', job: 'JH AA B',
  school: 'S K UW L', book: 'B UH K', word: 'W ER D',
  story: 'S T AO R IY', question: 'K W EH S CH AH N', problem: 'P R AA B L AH M',
  idea: 'AY D IY AH', country: 'K AH N T R IY',
  city: 'S IH T IY', car: 'K AA R', phone: 'F OW N',
  computer: 'K AH M P Y UW T ER', internet: 'IH N T ER N EH T',
  robot: 'R OW B AH T', machine: 'M AH SH IY N',
  music: 'M Y UW Z IH K', voice: 'V OY S', sound: 'S AW N D',
  picture: 'P IH K CH ER', video: 'V IH D IY OW',
  game: 'G EY M', movie: 'M UW V IY', show: 'SH OW',

  // Tech / AI terms
  ai: 'EY AY', llm: 'EH L EH L EH M',
  model: 'M AA D AH L', token: 'T OW K AH N',
  prompt: 'P R AA M P T', inference: 'IH N F ER AH N S',
  neural: 'N UH R AH L', network: 'N EH T W ER K',
  training: 'T R EY N IH NG', dataset: 'D EY T AH S EH T',
  openclaw: 'OW P AH N K L AO', github: 'G IH T HH AH B',
  code: 'K OW D', data: 'D EY T AH', server: 'S ER V ER',
  claude: 'K L AO D', anthropic: 'AE N TH R AH P IH K',

  // Adjectives
  good: 'G UH D', great: 'G R EY T', nice: 'N AY S',
  bad: 'B AE D', terrible: 'T EH R AH B AH L', awful: 'AO F AH L',
  big: 'B IH G', small: 'S M AO L', large: 'L AA R JH',
  long: 'L AO NG', short: 'SH AO R T', tall: 'T AO L',
  old: 'OW L D', new: 'N UW', young: 'Y AH NG',
  fast: 'F AE S T', slow: 'S L OW', quick: 'K W IH K',
  hot: 'HH AA T', cold: 'K OW L D', warm: 'W AO R M', cool: 'K UW L',
  happy: 'HH AE P IY', sad: 'S AE D', angry: 'AE NG G R IY',
  excited: 'EH K S AY T AH D', tired: 'T AY R D', bored: 'B AO R D',
  smart: 'S M AA R T', stupid: 'S T UW P AH D', clever: 'K L EH V ER',
  funny: 'F AH N IY', serious: 'S IH R IY AH S', weird: 'W IH R D',
  crazy: 'K R EY Z IY', silly: 'S IH L IY', beautiful: 'B Y UW T AH F AH L',
  ugly: 'AH G L IY', rich: 'R IH CH', poor: 'P UH R',
  strong: 'S T R AO NG', weak: 'W IY K', hard: 'HH AA R D',
  easy: 'IY Z IY', simple: 'S IH M P AH L', complex: 'K AH M P L EH K S',
  real: 'R IY L', fake: 'F EY K', true: 'T R UW', false: 'F AO L S',
  right: 'R AY T', wrong: 'R AO NG', correct: 'K ER EH K T',
  possible: 'P AA S AH B AH L', impossible: 'IH M P AA S AH B AH L',
  important: 'IH M P AO R T AH N T', special: 'S P EH SH AH L',
  different: 'D IH F R AH N T', same: 'S EY M',
  ready: 'R EH D IY', free: 'F R IY', busy: 'B IH Z IY',
  sure: 'SH UH R', certain: 'S ER T AH N', maybe: 'M EY B IY',
  enough: 'IH N AH F', more: 'M AO R', less: 'L EH S',

  // Adverbs / prepositions / conjunctions
  very: 'V EH R IY', really: 'R IY L IY', quite: 'K W AY T',
  too: 'T UW', also: 'AO L S OW', just: 'JH AH S T',
  only: 'OW N L IY', even: 'IY V AH N', still: 'S T IH L',
  already: 'AO L R EH D IY', always: 'AO L W EY Z', never: 'N EH V ER',
  now: 'N AW', then: 'DH EH N', soon: 'S UW N', later: 'L EY T ER',
  again: 'AH G EH N', once: 'W AH N S', twice: 'T W AY S',
  here: 'HH IH R', there: 'DH EH R', somewhere: 'S AH M W EH R',
  everywhere: 'EH V R IY W EH R', nowhere: 'N OW W EH R',
  up: 'AH P', down: 'D AW N', in: 'IH N', out: 'AW T',
  on: 'AO N', off: 'AO F', over: 'OW V ER', under: 'AH N D ER',
  around: 'ER AW N D', through: 'TH R UW', between: 'B IH T W IY N',
  before: 'B IH F AO R', after: 'AE F T ER', during: 'D UH R IH NG',
  while: 'W AY L', until: 'AH N T IH L', since: 'S IH N S',
  because: 'B IH K AO Z', although: 'AO L DH OW', however: 'HH AW EH V ER',
  therefore: 'DH EH R F AO R', maybe: 'M EY B IY', perhaps: 'P ER HH AE P S',
  about: 'AH B AW T', without: 'W IH TH AW T',
  against: 'AH G EH N S T', toward: 'T AO R D',
  almost: 'AO L M OW S T', really: 'R IY AH L IY',

  // Numbers
  one: 'W AH N', two: 'T UW', three: 'TH R IY', four: 'F AO R',
  five: 'F AY V', six: 'S IH K S', seven: 'S EH V AH N',
  eight: 'EY T', nine: 'N AY N', ten: 'T EH N', eleven: 'IH L EH V AH N',
  twelve: 'T W EH L V', twenty: 'T W EH N T IY', thirty: 'TH ER T IY',
  hundred: 'HH AH N D R AH D', thousand: 'TH AW Z AH N D',
  million: 'M IH L Y AH N', billion: 'B IH L Y AH N',
  first: 'F ER S T', second: 'S EH K AH N D', third: 'TH ER D',
  zero: 'Z IH R OW',

  // Colors
  red: 'R EH D', blue: 'B L UW', green: 'G R IY N',
  yellow: 'Y EH L OW', black: 'B L AE K', white: 'W AY T',
  orange: 'AO R AH N JH', purple: 'P ER P AH L',
  pink: 'P IH NG K', brown: 'B R AW N', gray: 'G R EY',

  // Animals
  cat: 'K AE T', dog: 'D AO G', bird: 'B ER D', fish: 'F IH SH',
  horse: 'HH AO R S', cow: 'K AW', pig: 'P IH G',
  chicken: 'CH IH K AH N', duck: 'D AH K', bear: 'B EH R',
  snake: 'S N EY K', spider: 'S P AY D ER', dragon: 'D R AE G AH N',

  // Days / months
  monday: 'M AH N D EY', tuesday: 'T UW Z D EY', wednesday: 'W EH N Z D EY',
  thursday: 'TH ER Z D EY', friday: 'F R AY D EY',
  saturday: 'S AE T ER D EY', sunday: 'S AH N D EY',
  january: 'JH AE N Y UW EH R IY', february: 'F EH B R UW EH R IY',
  march: 'M AA R CH', april: 'EY P R AH L', may: 'M EY',
  june: 'JH UW N', july: 'JH UH L AY', august: 'AO G AH S T',
  september: 'S EH P T EH M B ER', october: 'AA K T OW B ER',
  november: 'N OW V EH M B ER', december: 'D IH S EH M B ER',

  // Question words
  why: 'W AY', how: 'HH AW', where: 'W EH R', when: 'W EH N',

  // Common missing from CMUdict cross-check
  language: 'L AE NG G W AH JH', together: 'T AH G EH DH ER',
  another: 'AH N AH DH ER', probably: 'P R AA B AH B L IY',
  definitely: 'D EH F AH N AH T L IY', absolutely: 'AE B S AH L UW T L IY',
  interesting: 'IH N T R AH S T IH NG', example: 'IH G Z AE M P AH L',
  future: 'F Y UW CH ER', actually: 'AE K CH AH L IY',
  different: 'D IH F ER AH N T', apple: 'AE P AH L',
  table: 'T EY B AH L', chair: 'CH EH R', window: 'W IH N D OW',
  problem: 'P R AA B L AH M', system: 'S IH S T AH M',
  information: 'IH N F ER M EY SH AH N', history: 'HH IH S T ER IY',
  program: 'P R OW G R AE M', number: 'N AH M B ER',
  company: 'K AH M P AH N IY', government: 'G AH V ER N M AH N T',
  president: 'P R EH Z IH D AH N T', power: 'P AW ER',
  music: 'M Y UW Z IH K', water: 'W AO T ER',
  fire: 'F AY R', business: 'B IH Z N AH S',
  mother: 'M AH DH ER', father: 'F AA DH ER',
  brother: 'B R AH DH ER', sister: 'S IH S T ER',
  happy: 'HH AE P IY', angry: 'AE NG G R IY',
  tired: 'T AY R D', hungry: 'HH AH NG G R IY',
  ready: 'R EH D IY', wrong: 'R AO NG', right: 'R AY T',
  human: 'HH Y UW M AH N', animal: 'AE N AH M AH L',
  science: 'S AY AH N S', magic: 'M AE JH IH K',
  space: 'S P EY S', earth: 'ER TH', sun: 'S AH N',
  moon: 'M UW N', star: 'S T AA R', planet: 'P L AE N AH T',
  universe: 'Y UW N AH V ER S', party: 'P AA R T IY',
  pizza: 'P IY T S AH', coffee: 'K AO F IY',
  chocolate: 'CH AO K L AH T', cookie: 'K UH K IY',
  breakfast: 'B R EH K F AH S T', dinner: 'D IH N ER',
  minute: 'M IH N AH T', second: 'S EH K AH N D',
  hour: 'AW ER', idea: 'AY D IY AH',
  story: 'S T AO R IY', action: 'AE K SH AH N',
  adventure: 'AE D V EH N CH ER', danger: 'D EY N JH ER',
  secret: 'S IY K R AH T', magic: 'M AE JH IH K',
  awesome: 'AO S AH M', cool: 'K UW L',
};

const LETTER_MAP = {
  a:'EY', b:'B IY', c:'S IY', d:'D IY', e:'IY', f:'EH F',
  g:'JH IY', h:'EY CH', i:'AY', j:'JH EY', k:'K EY', l:'EH L',
  m:'EH M', n:'EH N', o:'OW', p:'P IY', q:'K Y UW', r:'AA R',
  s:'EH S', t:'T IY', u:'Y UW', v:'V IY', w:'D AH B AH L Y UW',
  x:'EH K S', y:'W AY', z:'Z IY',
};

function englishToArpabet(text, opts = {}) {
  const {
    wordGap = 18,       // ms between words (0=run-on, 15-25=natural, 50+=deliberate)
    commaPause = 80,    // ms for commas
    periodPause = 150,  // ms for sentence end (300 is too long/robotic)
    questionPause = 170,// ms for questions (slightly longer)
    groupSyllables = true, // wrap multi-syllable words in ( ) for better rhythm
  } = opts;

  const raw = text.toLowerCase().trim();
  const spaced = raw.replace(/([.,;:!?])/g, ' $1 ');
  const tokens = spaced.split(/\s+/);
  const parts = [];
  const unknown = [];

  const isMultiSyllable = (phonemes) => {
    // Count vowel phonemes to determine syllable count
    const vowels = ['IY','IH','EH','AE','AA','AO','AH','UH','UW','ER','AY','AW','EY','OW','OY'];
    const phonemeList = phonemes.split(' ');
    const count = phonemeList.filter(p => vowels.includes(p)).length;
    return count >= 2;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // Punctuation → micro-pauses (not the coarse klattsch , . ; markers)
    if (token === '.' || token === '!') {
      parts.push(`p${periodPause}`);
      continue;
    }
    if (token === '?') {
      parts.push(`p${questionPause}`);
      continue;
    }
    if (token === ',' || token === ';' || token === ':') {
      parts.push(`p${commaPause}`);
      continue;
    }

    // Word separator — tiny gap between words for natural flow
    if (i > 0 && wordGap > 0 && !tokens[i-1].match(/[.,;:!?]/)) {
      parts.push(`p${wordGap}`);
    }

    let phonemes;
    if (WORD_MAP[token]) {
      phonemes = WORD_MAP[token];
    } else {
      unknown.push(token);
      phonemes = token.split('').map(c => LETTER_MAP[c] || 'AH').join(' ');
    }

    // Group multi-syllable words for better rhythm
    if (groupSyllables && isMultiSyllable(phonemes)) {
      parts.push(`( ${phonemes} )`);
    } else {
      parts.push(phonemes);
    }
  }

  let phonemes = parts.join(' ').replace(/\s+/g, ' ').trim();
  // Clean up redundant pN next to pN
  phonemes = phonemes.replace(/p(\d+)\s+p(\d+)/g, (_, a, b) => `p${Math.max(parseInt(a), parseInt(b))}`);

  return {
    phonemes,
    unknownWords: unknown,
    note: unknown.length > 0
      ? `Words not in dictionary (spelled out letter-by-letter): ${unknown.join(', ')}. These will sound robotic — consider hand-crafting them.`
      : 'All words found in dictionary.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP SERVER
// ═══════════════════════════════════════════════════════════════════════════════

const server = new McpServer({
  name: 'klattsch-mcp',
  version: '2.0.0',
});

// ── Tool: speak ──────────────────────────────────────────────────────────────
server.tool(
  'speak',
  `Synthesize speech from a klattsch phoneme string. Returns base64 WAV audio.

## What This Is
klattsch is a formant speech synthesizer (late-70s/early-80s style — think Votrax, SAM).
You give it a string of ARPAbet phoneme codes with optional voice control directives,
and it renders a WAV audio file.

## How To Use This Tool

### Step 1: Build a phoneme string
Write ARPAbet phonemes separated by spaces, with control directives mixed in.
Use the text_to_phonemes tool first to convert English text, then refine by hand.

### Step 2 (optional): Set voice character
Prefix your utterance with control directives to set the voice:
- bN: base pitch in Hz (b120 = default male, b200 = female, b280 = child)
- rN: per-phoneme duration in ms (r80 = fast, r110 = normal, r250+ = sung)
- sN: formant scale (1.0 = male, 1.17 = female, 1.3 = child)
- vN: vibrato depth in Hz (v3-v6 = expressive, v0 = off)
- hN: breathiness 0..1 (h0.3 = airy/whispery)
- gN: vocal effort 0=lax..1=tense (default 0.5)
- tN: spectral tilt -0.9=darker..+0.9=brighter (t-0.4 = warm, t0.3 = bright)

### Step 3: Add prosody (intonation)
- ! after a vowel for stress: DH AE! T = "THAT" with emphasis
- +N/-N on vowels for pitch changes: AY+20 = rising "I", D AH N(-30) = falling "done"
- (+N)/(-N) for transient ornaments (don't carry forward)
- , ; . for pauses: 100ms, 200ms, 300ms

### Step 4: Render
Pass the complete string to this tool.

## Quick-Reference Voice Presets

| Preset | Directives | Description |
|--------|-----------|-------------|
| Male natural | b120 r100 s1.0 v2 | Default voice |
| Male deep | b90 r95 s0.92 v1 t-0.3 g0.6 | Deep, authoritative |
| Male bright | b130 r105 s1.0 v2 t0.2 | Clear, energetic |
| Female natural | b200 r100 s1.17 v2 | Natural female |
| Female warm | b185 r105 s1.15 v3 t-0.2 | Warm, friendly |
| Female bright | b220 r100 s1.18 v2 t0.2 | Bright, cheery |
| Child | b280 r90 s1.3 v1 | Young, higher pitch |
| Robot | b120 r90 s1.0 v0 h0 g0.8 t0.5 | Flat, mechanical |
| Whisper | b120 r100 s1.0 v0 h0.6 g0.1 | Breathy whisper |
| Dramatic | b100 r130 s1.0 v5 | Slow, theatrical |
| Singing male | bC4 r300 s1.0 v5 | For sung notes |
| Singing female | bG4 r300 s1.17 v4 | For sung notes |

## Intonation Patterns That Sound Natural

Falling statement (period):   last vowel gets -20 to -30    e.g. D AH N(-25)
Rising question:              last vowel gets +20 to +30    e.g. R EH D IY(+25)
Listing items:                each item rises, last falls   e.g. AE(+15) P AH L Z(+15) AO R AH N JH(-20)
Excited:                      higher base pitch, faster     b140 r85 ...
Serious/deep:                 lower base pitch, slower      b95 r115 ...
Sarcastic:                    exaggerated pitch swings      AY+30 M . S OW(-30) . S AH R K AE S T IH K

## Singing With Note Names
Instead of Hz for b, use note names: bC4, bD#4, bEb4, bF4, bG4, bA4, bB4
Middle C = C4 (261Hz), A4 = 440Hz
Set r250-r400 per phoneme, group notes with parentheses:
  bC4 r300 ( HH AH ) ( L OW ) bE4 ( W ER L D )

## Example Strings

1. "Hello world" (male, natural):
   b120 r100 s1.0 v2 HH AH p18 L OW p18 W ER L D p150

2. "How are you?" (female, rising):
   b200 s1.17 v2 HH AW p18 AA R p18 Y UW(+25) p170

3. "I am NOT impressed" (stress on NOT):
   b120 r95 AY p15 AE M p15 N AO T! p60 IH M P R EH S T(-20) p150

4. "The quick brown fox" (energetic):
   b135 r90 t0.2 DH AH p18 K W IH K p18 B R AW N p18 F AA K S p150

5. Sing "Twinkle twinkle" (note per syllable):
   bC4 r300 ( T W IH NG ) ( K AH L ) bG4 r300 ( T W IH NG ) ( K AH L )

6. Dramatic movie trailer voice:
   b95 r140 s0.95 v4 t-0.3 g0.7 IH N p100 AH p100 W ER L D(-25) p200

7. Robot announcement:
   b130 r85 s1.0 v0 h0 g0.8 t0.4 AH T EH N SH AH N p60 P L IY Z p150

8. Whispered secret:
   b110 r105 v0 h0.5 g0.1 s1.0 P S T p40 D OW N T p40 T EH L p40 EH N IY W AH N p150

## 🎯 Pro Techniques for Human-Like Speech & Singing

### 1. Micro-pauses, not coarse markers
Use pN (exact ms) instead of . (300ms) or , (100ms):
- p15-p25 between words → natural conversational flow
- p50-p80 at commas → breath-like pause
- p120-p180 at sentence end → natural cadence
- p10 between syllables in fast phrases

### 2. Per-syllable rate changes (CRITICAL for singing)
Don't set rate once — vary it constantly:
\`\`\`
r350 bC4 OW r10 T r10 K r200 bD4 AE r100 N r50 W
// ^ fast consonants, slow held vowels = natural singing
\`\`\`

### 3. Per-syllable pitch (for songs)
Every syllable gets its own note:
\`\`\`
bF#2 ( W ER ) bA2 ( K IH T ) bF#3 ( HH AA R ) bA3 ( D ER )
// Each (group) at a different pitch = sung melody
\`\`\`

### 4. Vibrato modulation
Don't just set v5 — ramp it:
\`\`\`
v3 ...sustained vowel... v+3 ...peak... v-10 ...release... v0
\`\`\`

### 5. Syllable grouping for rhythm
Wrap syllables in ( ) to share a rate slot, producing natural rhythm:
\`\`\`
( HH EH ) ( L OW ) — not HH EH L OW
\`\`\`

### 6. Tremolo for texture
Add m0.1-m0.3 for a warbly/vintage effect on held notes.

### 7. Float rates
Fractional rates work: r243.2 — use for precise timing in complex songs.

## Phoneme Categories (all 39 phonemes)
Vowels: IY IH EH AE AA AO AH UH UW ER AY AW EY OW OY
Sonorants: W Y R L M N NG
Fricatives: F TH S SH V DH Z ZH HH
Stops: P B T D K G (these get automatic burst + silence)
Affricates: CH JH

⚠️ P, B, T, D, K, G, CH, JH are stop consonants — they include an automatic silence-burst pattern. Don't add extra pauses after them.`,
  {
    utterance: z.string().describe(
      'The klattsch phoneme string. ARPAbet codes + control directives, whitespace-separated. Use text_to_phonemes to convert English first, then tweak.'
    ),
    sampleRate: z.number().int().min(8000).max(48000).optional().default(22050),
  },
  async ({ utterance, sampleRate }) => {
    try {
      const { base64, durationMs, warnings } = renderToWavBase64(utterance, sampleRate);
      const warningText = warnings.length > 0
        ? `\n⚠️ Warnings: ${warnings.join('; ')}`
        : '';
      return {
        content: [
          {
            type: 'text',
            text: `✅ Rendered ${durationMs}ms (${(durationMs/1000).toFixed(1)}s) at ${sampleRate}Hz.${warningText}`,
          },
          {
            type: 'resource',
            resource: {
              uri: `data:audio/wav;base64,${base64}`,
              mimeType: 'audio/wav',
              text: base64,
            },
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Synthesis error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: speak_file ─────────────────────────────────────────────────────────
server.tool(
  'speak_file',
  `Like speak, but writes the WAV directly to a file on disk and returns the path.
Use this when you need to attach or share the audio file.

Returns: { filePath, byteLength, durationMs, warnings }`,
  {
    utterance: z.string().describe('The klattsch phoneme string.'),
    filePath: z.string().describe(
      'Absolute path to write the WAV file. E.g. /home/user/output.wav'
    ),
    sampleRate: z.number().int().min(8000).max(48000).optional().default(22050),
  },
  async ({ utterance, filePath, sampleRate }) => {
    try {
      const result = renderToWavFile(utterance, filePath, sampleRate);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              filePath: result.filePath,
              byteLength: result.byteLength,
              durationMs: result.durationMs,
              durationSec: (result.durationMs / 1000).toFixed(1),
              sampleRate,
              warnings: result.warnings,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: text_to_phonemes ───────────────────────────────────────────────────
server.tool(
  'text_to_phonemes',
  `Convert English text to an approximate klattsch phoneme string.

Uses micro-pauses (p15-p25) between words for natural flow instead of
the coarse klattsch , . ; markers. Multi-syllable words are wrapped in ( )
for better rhythmic grouping.

For SINGING or highly expressive speech, you MUST hand-tune the output —
see the speak tool description for pro techniques.

Returns a phoneme string ready for speak/speak_file. Always edit it before
final render: add stress (!), pitch contours (+N/-N), per-word rate changes.`,
  {
    text: z.string().describe('The English text to convert.'),
    pitch: z.number().optional().default(120).describe(
      'Base pitch in Hz. 100-140=male, 180-220=female, 250-300=child.'
    ),
    rate: z.number().optional().default(105).describe(
      'Global per-phoneme rate in ms. 85-105=natural speech, 200-400=sung.'
    ),
    formantScale: z.number().optional().default(1.0).describe(
      'Formant scale: 1.0=male, 1.17=female, 1.3=child.'
    ),
    vibrato: z.number().optional().default(2).describe(
      'Vibrato depth Hz. 0=off, 2-3=natural, 5+=dramatic.'
    ),
    wordGap: z.number().optional().default(18).describe(
      'Micro-pause ms between words. 0=run-on, 15-25=natural, 50+=deliberate.'
    ),
    periodPause: z.number().optional().default(150).describe(
      'Pause ms at sentence end. 100-180=natural, 300=robotic/too-long.'
    ),
    groupSyllables: z.boolean().optional().default(true).describe(
      'Wrap multi-syllable words in ( ) for better rhythm. Disable for fast speech.'
    ),
  },
  async ({ text, pitch, rate, formantScale, vibrato, wordGap, periodPause, groupSyllables }) => {
    const { phonemes, unknownWords, note } = englishToArpabet(text, { wordGap, periodPause, groupSyllables });
    const directives = `b${pitch} r${rate} s${formantScale.toFixed(2)} v${vibrato}`;
    const full = `${directives} ${phonemes}`;

    return {
      content: [
        {
          type: 'text',
          text: [
            `**Voice:** pitch=${pitch}Hz rate=${rate}ms scale=${formantScale} vibrato=${vibrato}Hz | wordGap=${wordGap}ms sentencePause=${periodPause}ms`,
            ``,
            `**Generated phoneme string:**`,
            `\`\`\``,
            full,
            `\`\`\``,
            ``,
            `**Note:** ${note}`,
            unknownWords.length > 0
              ? `\nUnknown words: ${unknownWords.join(', ')}\n→ Spelled letter-by-letter. Hand-craft these for best quality.`
              : '',
            ``,
            `**Next:** Pass to **speak** or **speak_file**. For expressive results, edit first:`,
            `- Add ! after stressed vowels: DH AE! T`,
            `- Add pitch contours: AY+20 (rising), D AH N(-25) (falling)`,
            `- Vary per-word rate: r85 for fast words, r120 for slow emphasis`,
            `- For songs: replace wordGap pauses with bNoteName per syllable`,
          ].join('\n'),
        },
      ],
    };
  }
);

// ── Tool: validate ───────────────────────────────────────────────────────────
server.tool(
  'validate',
  'Parse a klattsch phoneme string without rendering audio. Returns schedule info, duration, and warnings.',
  {
    utterance: z.string().describe('The klattsch phoneme string to validate.'),
  },
  async ({ utterance }) => {
    try {
      const { schedule, totalMs, warnings, phrases } = compileString(utterance);
      return {
        content: [
          {
            type: 'text',
            text: [
              `✅ Valid klattsch string.`,
              `- Estimated duration: ${Math.round(totalMs)}ms (${(totalMs/1000).toFixed(1)}s)`,
              `- Schedule events: ${schedule.length}`,
              `- Phrases: ${phrases?.length ?? 'n/a'}`,
              warnings.length > 0
                ? `- ⚠️ Warnings:\n${warnings.map(w => '  • ' + w).join('\n')}`
                : `- No warnings.`,
            ].join('\n'),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Parse error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: list_phonemes ──────────────────────────────────────────────────────
server.tool(
  'list_phonemes',
  'List all 39 ARPAbet phoneme codes supported by klattsch, with example words and voice tips.',
  {},
  async () => {
    const guide = [
      `## All ${PHONEME_KEYS.length} ARPAbet Phonemes in klattsch`,
      ``,
      '### Vowels (15)',
      '| Code | Example | Notes |',
      '|------|---------|-------|',
      '| IY | fleece, see, me | Long ee |',
      '| IH | kit, bit, if | Short i |',
      '| EH | dress, bed, head | Short e |',
      '| AE | trap, cat, bad | Short a |',
      '| AA | lot, father, palm | Open ah |',
      '| AO | thought, law, caught | Rounded aw |',
      '| AH | strut, but, cup | Schwa / uh |',
      '| UH | foot, book, good | Short oo |',
      '| UW | goose, food, blue | Long oo |',
      '| ER | nurse, bird, her | R-colored |',
      '| AY | price, eye, fly | Diphthong ah→ee |',
      '| AW | mouth, now, out | Diphthong ah→oo |',
      '| EY | face, day, they | Diphthong eh→ee |',
      '| OW | goat, no, go | Diphthong oh→oo |',
      '| OY | choice, boy, voice | Diphthong oh→ee |',
      '',
      '### Sonorants (7)',
      '| W | wet, one |',
      '| Y | yes, yellow |',
      '| R | red, try |',
      '| L | left, call |',
      '| M | man, sum |',
      '| N | no, sun |',
      '| NG | sing, ring |',
      '',
      '### Unvoiced Fricatives (6)',
      '| F | fat, coffee |',
      '| TH | think, bath |',
      '| S | see, bus | High-frequency hiss |',
      '| SH | she, rush | Mid-frequency hiss |',
      '| HH | hat, ahead | Breathy h |',
      '',
      '### Voiced Fricatives (4)',
      '| V | van, save |',
      '| DH | this, father |',
      '| Z | zoo, jazz |',
      '| ZH | measure, rouge | Rare in English |',
      '',
      '### Stops (8) — auto silence+burst',
      '| P | pot, lip | Unvoiced bilabial |',
      '| B | bad, cob | Voiced bilabial |',
      '| T | top, cat | Unvoiced alveolar |',
      '| D | dog, bad | Voiced alveolar |',
      '| K | cat, back | Unvoiced velar |',
      '| G | get, bag | Voiced velar |',
      '',
      '### Affricates (2) — auto silence+burst',
      '| CH | church, watch |',
      '| JH | judge, age |',
      '',
      `### Raw list: ${PHONEME_KEYS.join(', ')}`,
      '',
      '### Tips for Natural Speech',
      '- **Diphthongs** (AY, AW, EY, OW, OY) automatically glide between two vowel positions — they sound much more natural than chaining two separate vowels.',
      '- **Stops** (P B T D K G CH JH) insert a short silence then burst — don\'t add , before them.',
      '- **Fricative hiss**: S and SH have energy concentrated in F3 (high frequencies). Z and ZH are their voiced equivalents.',
      '- **Nasals** (M N NG): M has low F2 (1270), N is mid (1340), NG is high (2000) — this is what distinguishes them.',
      '- **Unstressed vowels**: Use AH (schwa) for reduced vowels: "about" = AH B AW T, "the" = DH AH.',
    ].join('\n');

    return {
      content: [{ type: 'text', text: guide }],
    };
  }
);

// ── Tool: voice_presets ──────────────────────────────────────────────────────
server.tool(
  'voice_presets',
  `Get copy-paste ready voice presets. Returns preset name → directive string.
Use these as prefixes before your phoneme strings.`,
  {
    preset: z.enum([
      'all', 'male_natural', 'male_deep', 'male_bright',
      'female_natural', 'female_warm', 'female_bright',
      'child', 'robot', 'whisper', 'dramatic', 'old_man',
      'singing_male', 'singing_female',
    ]).optional().default('all').describe('Which preset to show, or "all" for everything.'),
  },
  async ({ preset }) => {
    const presets = {
      male_natural:    { directives: 'b120 r100 s1.0 v2', desc: 'Default male voice, natural pacing' },
      male_deep:       { directives: 'b90 r95 s0.92 v1 t-0.3 g0.6', desc: 'Deep, authoritative, warm' },
      male_bright:     { directives: 'b135 r100 s1.0 v2 t0.2', desc: 'Clear, energetic, brighter tone' },
      female_natural:  { directives: 'b200 r100 s1.17 v2', desc: 'Default female voice' },
      female_warm:     { directives: 'b185 r105 s1.15 v3 t-0.2', desc: 'Warm, friendly female' },
      female_bright:   { directives: 'b220 r100 s1.18 v2 t0.2', desc: 'Bright, cheery female' },
      child:           { directives: 'b280 r90 s1.3 v1', desc: 'Child-like, higher pitch, smaller vocal tract' },
      robot:           { directives: 'b120 r85 s1.0 v0 h0 g0.8 t0.5', desc: 'Flat, mechanical, no vibrato' },
      whisper:         { directives: 'b110 r105 s1.0 v0 h0.6 g0.1', desc: 'Breathy whisper' },
      dramatic:        { directives: 'b100 r140 s1.0 v5 t-0.2 g0.65', desc: 'Slow, theatrical, heavy vibrato' },
      old_man:         { directives: 'b95 r105 s0.95 v3 h0.2 g0.4 t-0.4', desc: 'Older, creaky, slower, darker' },
      singing_male:    { directives: 'bC4 r300 s1.0 v5', desc: 'For male sung notes — set pitch per syllable with bNoteName' },
      singing_female:  { directives: 'bG4 r300 s1.17 v4', desc: 'For female sung notes — set pitch per syllable with bNoteName' },
    };

    const formatPreset = (name, p) => [
      `### ${name}`,
      `**Description:** ${p.desc}`,
      `**Directives:** \`${p.directives}\``,
      `**Usage:** \`${p.directives} PHONEMES HERE\``,
      ``,
    ].join('\n');

    if (preset === 'all') {
      return {
        content: [{
          type: 'text',
          text: [
            '# Voice Presets',
            '',
            'Use these as prefixes. Example:',
            '`b120 r100 s1.0 v2 HH AH L OW . W ER L D`',
            '',
            ...Object.entries(presets).map(([k, v]) => formatPreset(k, v)),
          ].join('\n'),
        }],
      };
    }

    const p = presets[preset];
    return {
      content: [{
        type: 'text',
        text: formatPreset(preset, p),
      }],
    };
  }
);

// ── Tool: compose (ADVANCED) ────────────────────────────────────────────────
server.tool(
  'compose',
  `⚠️ ADVANCED TOOL — Only use this if you fully understand klattsch formant synthesis.
For simple speech, use the regular \`speak\` or \`text_to_phonemes\` tools instead.

Compose a multi-segment audio piece with full control over timing, voices,
and prosody. Build conversations, songs, dramatic scenes, or any speech
that needs varying voices, precise pauses, and musical pitch control.

## Input: a JSON "score"

Provide a score object with \`segments\` (array) and optional \`sampleRate\`:

### Segment fields:
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| phonemes | string | **required** | ARPAbet phoneme string for this segment |
| voice | string | "male_natural" | Voice preset name (see presets below) |
| prePause | number | 0 | Silence before this segment in ms |
| postPause | number | 0 | Silence after this segment in ms |
| note | string | null | Override starting pitch as note (e.g. "C4", "G#3") — enables sung mode |
| pitchHz | number | null | Override starting pitch in Hz (e.g. 200, 120) |
| rate | number | 110 | Per-phoneme rate in ms (80=fast, 110=normal, 250+=sung) |
| pitchShift | number | 0 | Shift pitch relative (-30=falling, +20=rising) for last phoneme |
| stress | string[] | [] | Words to stress within this segment (adds ! after their vowels) |
| label | string | null | Label for this segment (helps organize complex compositions) |

### Voice presets (for the \`voice\` field):
- male_natural, male_deep, male_bright
- female_natural, female_warm, female_bright
- child, robot, whisper, dramatic, old_man
- singing_male, singing_female

### Segment build process:
1. Start with voice preset directives
2. If note/pitchHz provided, override base pitch
3. Set custom rate if specified
4. Add prePause as pN directive
5. Append phoneme string
6. Apply pitchShift to final phoneme
7. Add postPause as pN directive

## Examples

### Two-voice conversation with dramatic pauses:
\`\`\`json
{
  "segments": [
    {"phonemes": "HH EH L OW . HH UW Z DH IH S", "voice": "male_deep", "postPause": 400},
    {"phonemes": "IH T S . AH . R OW B AH T . AH V . K AO R S", "voice": "robot", "prePause": 200, "postPause": 600},
    {"phonemes": "W EH L . DH AE T S . N OW T . G UH D(-25)", "voice": "male_deep", "prePause": 300}
  ]
}
\`\`\`

### Sung melody (verse + chorus):
\`\`\`json
{
  "segments": [
    {"phonemes": "T W IH NG K AH L . T W IH NG K AH L", "voice": "singing_male", "note": "C4", "rate": 300},
    {"phonemes": "L IH T AH L . S T AA R", "voice": "singing_male", "note": "G4", "rate": 320, "pitchShift": -20}
  ]
}
\`\`\`

### Dramatic narration with varied pacing:
\`\`\`json
{
  "segments": [
    {"phonemes": "IH N . AH . W ER L D . W EH R . EH V R IY TH IH NG . CH EY N JH D", "voice": "dramatic", "prePause": 500, "postPause": 800},
    {"phonemes": "W AH N . M AE N(-25)", "voice": "dramatic", "rate": 160, "note": "A2"},
    {"phonemes": "W AH N . T OW S T ER(-30)", "voice": "dramatic", "rate": 180, "note": "E3", "prePause": 400}
  ]
}
\`\`\``,
  {
    score: z.string().describe(
      'JSON string of the score object with a "segments" array. Each segment has phonemes + optional voice, prePause, postPause, note, pitchHz, rate, pitchShift, label.'
    ),
    sampleRate: z.number().int().min(8000).max(48000).optional().default(22050),
    outputPath: z.string().optional().describe(
      'If provided, writes WAV to this file path instead of returning base64.'
    ),
  },
  async ({ score, sampleRate, outputPath }) => {
    try {
      const data = typeof score === 'string' ? JSON.parse(score) : score;
      if (!data.segments || !Array.isArray(data.segments)) {
        throw new Error('score must have a "segments" array');
      }

      const VOICE_DIRECTIVES = {
        male_natural:    'b120 r100 s1.0 v2',
        male_deep:       'b90 r95 s0.92 v1 t-0.3 g0.6',
        male_bright:     'b135 r100 s1.0 v2 t0.2',
        female_natural:  'b200 r100 s1.17 v2',
        female_warm:     'b185 r105 s1.15 v3 t-0.2',
        female_bright:   'b220 r100 s1.18 v2 t0.2',
        child:           'b280 r90 s1.3 v1',
        robot:           'b120 r85 s1.0 v0 h0 g0.8 t0.5',
        whisper:         'b110 r105 s1.0 v0 h0.6 g0.1',
        dramatic:        'b100 r140 s1.0 v5 t-0.2 g0.65',
        old_man:         'b95 r105 s0.95 v3 h0.2 g0.4 t-0.4',
        singing_male:    'bC4 r300 s1.0 v5',
        singing_female:  'bG4 r300 s1.17 v4',
      };

      const parts = [];
      const summary = [];

      for (let i = 0; i < data.segments.length; i++) {
        const seg = data.segments[i];
        if (!seg.phonemes) throw new Error(`Segment ${i} missing phonemes`);

        const tokens = [];

        // Pre-pause
        if (seg.prePause && seg.prePause > 0) {
          tokens.push(`p${Math.round(seg.prePause)}`);
        }

        // Voice directives
        const voice = VOICE_DIRECTIVES[seg.voice] || VOICE_DIRECTIVES.male_natural;
        tokens.push(voice);

        // Note/pitch override
        if (seg.note) {
          tokens.push(`b${seg.note}`);
        } else if (seg.pitchHz) {
          tokens.push(`b${seg.pitchHz}`);
        }

        // Custom rate
        if (seg.rate) {
          tokens.push(`r${seg.rate}`);
        }

        // Phonemes
        tokens.push(seg.phonemes);

        // Post-pause
        if (seg.postPause && seg.postPause > 0) {
          tokens.push(`p${Math.round(seg.postPause)}`);
        }

        parts.push(tokens.join(' '));
        summary.push({
          index: i,
          label: seg.label || `segment_${i}`,
          voice: seg.voice || 'male_natural',
          note: seg.note || null,
          prePause: seg.prePause || 0,
          postPause: seg.postPause || 0,
        });
      }

      const utterance = parts.join(' ');
      const { base64, durationMs, warnings } = renderToWavBase64(utterance, sampleRate);

      let fileInfo = null;
      if (outputPath) {
        const bytes = Buffer.from(base64, 'base64');
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, bytes);
        fileInfo = { path: outputPath, bytes: bytes.length };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              durationMs,
              durationSec: (durationMs / 1000).toFixed(1),
              segmentCount: data.segments.length,
              segments: summary,
              warnings,
              ...(fileInfo ? { file: fileInfo } : {}),
            }, null, 2),
          },
          ...(outputPath ? [] : [{
            type: 'resource',
            resource: {
              uri: `data:audio/wav;base64,${base64}`,
              mimeType: 'audio/wav',
              text: base64,
            },
          }]),
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Compose error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════════

const transport = new StdioServerTransport();
await server.connect(transport);
