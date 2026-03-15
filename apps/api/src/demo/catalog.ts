import { createHash } from "node:crypto";

export interface DemoLanguageSeed {
  isoCode: string;
  commonName: string;
  nativeName: string;
  family: string[];
  region: string;
  mainCountries: string[];
  toneHz: number;
}

export const demoLanguages: DemoLanguageSeed[] = [
  { isoCode: "eng", commonName: "English", nativeName: "English", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["United Kingdom", "United States"], toneHz: 220 },
  { isoCode: "deu", commonName: "German", nativeName: "Deutsch", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["Germany", "Austria"], toneHz: 233 },
  { isoCode: "fra", commonName: "French", nativeName: "Francais", family: ["Indo-European", "Romance"], region: "Europe", mainCountries: ["France", "Belgium"], toneHz: 246 },
  { isoCode: "spa", commonName: "Spanish", nativeName: "Espanol", family: ["Indo-European", "Romance"], region: "Americas", mainCountries: ["Spain", "Mexico"], toneHz: 261 },
  { isoCode: "ita", commonName: "Italian", nativeName: "Italiano", family: ["Indo-European", "Romance"], region: "Europe", mainCountries: ["Italy"], toneHz: 277 },
  { isoCode: "por", commonName: "Portuguese", nativeName: "Portugues", family: ["Indo-European", "Romance"], region: "Americas", mainCountries: ["Brazil", "Portugal"], toneHz: 293 },
  { isoCode: "nld", commonName: "Dutch", nativeName: "Nederlands", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["Netherlands", "Belgium"], toneHz: 311 },
  { isoCode: "swe", commonName: "Swedish", nativeName: "Svenska", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["Sweden"], toneHz: 329 },
  { isoCode: "nor", commonName: "Norwegian", nativeName: "Norsk", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["Norway"], toneHz: 349 },
  { isoCode: "dan", commonName: "Danish", nativeName: "Dansk", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["Denmark"], toneHz: 369 },
  { isoCode: "rus", commonName: "Russian", nativeName: "Russkiy", family: ["Indo-European", "Slavic"], region: "Eastern Europe", mainCountries: ["Russia"], toneHz: 392 },
  { isoCode: "ukr", commonName: "Ukrainian", nativeName: "Ukrayinska", family: ["Indo-European", "Slavic"], region: "Eastern Europe", mainCountries: ["Ukraine"], toneHz: 415 },
  { isoCode: "pol", commonName: "Polish", nativeName: "Polski", family: ["Indo-European", "Slavic"], region: "Central Europe", mainCountries: ["Poland"], toneHz: 440 },
  { isoCode: "ces", commonName: "Czech", nativeName: "Cestina", family: ["Indo-European", "Slavic"], region: "Central Europe", mainCountries: ["Czech Republic"], toneHz: 466 },
  { isoCode: "ron", commonName: "Romanian", nativeName: "Romana", family: ["Indo-European", "Romance"], region: "Eastern Europe", mainCountries: ["Romania"], toneHz: 493 },
  { isoCode: "ell", commonName: "Greek", nativeName: "Ellinika", family: ["Indo-European", "Hellenic"], region: "Southern Europe", mainCountries: ["Greece"], toneHz: 523 },
  { isoCode: "fin", commonName: "Finnish", nativeName: "Suomi", family: ["Uralic"], region: "Northern Europe", mainCountries: ["Finland"], toneHz: 554 },
  { isoCode: "hun", commonName: "Hungarian", nativeName: "Magyar", family: ["Uralic"], region: "Central Europe", mainCountries: ["Hungary"], toneHz: 587 },
  { isoCode: "tur", commonName: "Turkish", nativeName: "Turkce", family: ["Turkic"], region: "Western Asia", mainCountries: ["Turkey"], toneHz: 622 },
  { isoCode: "arb", commonName: "Arabic", nativeName: "al-arabiyya", family: ["Afro-Asiatic", "Semitic"], region: "Middle East", mainCountries: ["Saudi Arabia", "Egypt"], toneHz: 659 },
  { isoCode: "arz", commonName: "Egyptian Arabic", nativeName: "Masri", family: ["Afro-Asiatic", "Semitic"], region: "North Africa", mainCountries: ["Egypt"], toneHz: 698 },
  { isoCode: "heb", commonName: "Hebrew", nativeName: "Ivrit", family: ["Afro-Asiatic", "Semitic"], region: "Middle East", mainCountries: ["Israel"], toneHz: 739 },
  { isoCode: "prs", commonName: "Dari", nativeName: "Dari", family: ["Indo-European", "Iranian"], region: "Central Asia", mainCountries: ["Afghanistan"], toneHz: 783 },
  { isoCode: "urd", commonName: "Urdu", nativeName: "Urdu", family: ["Indo-European", "Indo-Aryan"], region: "South Asia", mainCountries: ["Pakistan", "India"], toneHz: 830 },
  { isoCode: "hin", commonName: "Hindi", nativeName: "Hindi", family: ["Indo-European", "Indo-Aryan"], region: "South Asia", mainCountries: ["India"], toneHz: 880 },
  { isoCode: "ben", commonName: "Bengali", nativeName: "Bangla", family: ["Indo-European", "Indo-Aryan"], region: "South Asia", mainCountries: ["Bangladesh", "India"], toneHz: 932 },
  { isoCode: "guj", commonName: "Gujarati", nativeName: "Gujarati", family: ["Indo-European", "Indo-Aryan"], region: "South Asia", mainCountries: ["India"], toneHz: 987 },
  { isoCode: "mar", commonName: "Marathi", nativeName: "Marathi", family: ["Indo-European", "Indo-Aryan"], region: "South Asia", mainCountries: ["India"], toneHz: 1046 },
  { isoCode: "tam", commonName: "Tamil", nativeName: "Tamil", family: ["Dravidian"], region: "South Asia", mainCountries: ["India", "Sri Lanka"], toneHz: 1108 },
  { isoCode: "tel", commonName: "Telugu", nativeName: "Telugu", family: ["Dravidian"], region: "South Asia", mainCountries: ["India"], toneHz: 1174 },
  { isoCode: "mal", commonName: "Malayalam", nativeName: "Malayalam", family: ["Dravidian"], region: "South Asia", mainCountries: ["India"], toneHz: 1244 },
  { isoCode: "jpn", commonName: "Japanese", nativeName: "Nihongo", family: ["Japonic"], region: "East Asia", mainCountries: ["Japan"], toneHz: 1318 },
  { isoCode: "kor", commonName: "Korean", nativeName: "Hanguk-eo", family: ["Koreanic"], region: "East Asia", mainCountries: ["South Korea"], toneHz: 1396 },
  { isoCode: "cmn", commonName: "Mandarin", nativeName: "Putonghua", family: ["Sino-Tibetan", "Sinitic"], region: "East Asia", mainCountries: ["China"], toneHz: 1480 },
  { isoCode: "yue", commonName: "Cantonese", nativeName: "Yueyu", family: ["Sino-Tibetan", "Sinitic"], region: "East Asia", mainCountries: ["Hong Kong", "China"], toneHz: 1567 },
  { isoCode: "tha", commonName: "Thai", nativeName: "Thai", family: ["Kra-Dai"], region: "Southeast Asia", mainCountries: ["Thailand"], toneHz: 1661 },
  { isoCode: "vie", commonName: "Vietnamese", nativeName: "Tieng Viet", family: ["Austroasiatic"], region: "Southeast Asia", mainCountries: ["Vietnam"], toneHz: 1760 },
  { isoCode: "ind", commonName: "Indonesian", nativeName: "Bahasa Indonesia", family: ["Austronesian"], region: "Southeast Asia", mainCountries: ["Indonesia"], toneHz: 1864 },
  { isoCode: "zsm", commonName: "Malay", nativeName: "Bahasa Melayu", family: ["Austronesian"], region: "Southeast Asia", mainCountries: ["Malaysia"], toneHz: 1975 },
  { isoCode: "khm", commonName: "Khmer", nativeName: "Khmer", family: ["Austroasiatic"], region: "Southeast Asia", mainCountries: ["Cambodia"], toneHz: 2093 },
  { isoCode: "amh", commonName: "Amharic", nativeName: "Amarigna", family: ["Afro-Asiatic", "Semitic"], region: "East Africa", mainCountries: ["Ethiopia"], toneHz: 2217 },
  { isoCode: "som", commonName: "Somali", nativeName: "Soomaali", family: ["Afro-Asiatic", "Cushitic"], region: "East Africa", mainCountries: ["Somalia"], toneHz: 2349 },
  { isoCode: "swh", commonName: "Swahili", nativeName: "Kiswahili", family: ["Niger-Congo", "Bantu"], region: "East Africa", mainCountries: ["Tanzania", "Kenya"], toneHz: 2489 },
  { isoCode: "yor", commonName: "Yoruba", nativeName: "Yoruba", family: ["Niger-Congo"], region: "West Africa", mainCountries: ["Nigeria"], toneHz: 2637 },
  { isoCode: "xho", commonName: "Xhosa", nativeName: "isiXhosa", family: ["Niger-Congo", "Bantu"], region: "Southern Africa", mainCountries: ["South Africa"], toneHz: 2793 },
  { isoCode: "que", commonName: "Quechua", nativeName: "Runasimi", family: ["Quechuan"], region: "South America", mainCountries: ["Peru", "Bolivia"], toneHz: 2959 },
  { isoCode: "hau", commonName: "Hausa", nativeName: "Hausa", family: ["Afro-Asiatic", "Chadic"], region: "West Africa", mainCountries: ["Nigeria", "Niger"], toneHz: 3135 },
  { isoCode: "jav", commonName: "Javanese", nativeName: "Basa Jawa", family: ["Austronesian"], region: "Southeast Asia", mainCountries: ["Indonesia"], toneHz: 3322 }
];

export function demoClipIdForLanguage(isoCode: string): string {
  const hash = createHash("sha256").update(`clip:${isoCode}`).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function demoPreviewPath(isoCode: string): string {
  return `/audio/${isoCode}-preview.wav`;
}

export function demoFullPath(isoCode: string): string {
  return `/audio/${isoCode}-full.wav`;
}

export function demoChecksumForLanguage(isoCode: string): string {
  return createHash("sha256").update(`demo:${isoCode}`).digest("hex");
}

export const demoConfusionPairs: Array<[string, string, number]> = [
  ["eng", "deu", 0.88],
  ["spa", "por", 0.92],
  ["swe", "nor", 0.95],
  ["swe", "dan", 0.82],
  ["rus", "ukr", 0.93],
  ["pol", "ces", 0.72],
  ["arb", "arz", 0.97],
  ["hin", "urd", 0.94],
  ["tam", "tel", 0.78],
  ["tam", "mal", 0.75],
  ["cmn", "yue", 0.9],
  ["ind", "zsm", 0.91],
  ["jpn", "kor", 0.55],
  ["amh", "arb", 0.43],
  ["swh", "xho", 0.36],
  ["yor", "hau", 0.41],
  ["que", "spa", 0.2],
  ["prs", "urd", 0.4],
  ["fra", "ita", 0.35],
  ["fra", "spa", 0.33]
];
