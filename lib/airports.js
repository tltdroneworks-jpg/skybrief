/** Built-in coordinates for common South African (and nearby) aerodromes. */
const AIRPORTS = {
  FAOR: { icao: "FAOR", name: "O.R. Tambo Intl (Johannesburg)", lat: -26.1392, lon: 28.246 },
  FACT: { icao: "FACT", name: "Cape Town Intl", lat: -33.9715, lon: 18.6021 },
  FALE: { icao: "FALE", name: "King Shaka Intl (Durban)", lat: -29.6144, lon: 31.1197 },
  FALA: { icao: "FALA", name: "Lanseria", lat: -25.9385, lon: 27.9261 },
  FAGM: { icao: "FAGM", name: "Rand Airport", lat: -26.2425, lon: 28.1512 },
  FAGC: { icao: "FAGC", name: "Grand Central", lat: -25.9863, lon: 28.1401 },
  FAGG: { icao: "FAGG", name: "George", lat: -34.0056, lon: 22.3789 },
  FAPE: { icao: "FAPE", name: "Chief Dawid Stuurman (Gqeberha)", lat: -33.9849, lon: 25.6173 },
  FABL: { icao: "FABL", name: "Bram Fischer (Bloemfontein)", lat: -29.0925, lon: 26.302 },
  FAWB: { icao: "FAWB", name: "Wonderboom (Pretoria)", lat: -25.6539, lon: 28.2242 },
  FAKN: { icao: "FAKN", name: "Kruger Mpumalanga", lat: -25.3832, lon: 31.1056 },
  FAUP: { icao: "FAUP", name: "Upington", lat: -28.3991, lon: 21.2602 },
  FAKM: { icao: "FAKM", name: "Kimberley", lat: -28.8028, lon: 24.7653 },
  FAMM: { icao: "FAMM", name: "Mmabatho / Mahikeng", lat: -25.7984, lon: 25.548 },
  FAPM: { icao: "FAPM", name: "Pietermaritzburg", lat: -29.649, lon: 30.3987 },
  FAVG: { icao: "FAVG", name: "Virginia (Durban)", lat: -29.7706, lon: 31.0583 },
  FAHS: { icao: "FAHS", name: "Hoedspruit", lat: -24.3686, lon: 31.0487 },
  FARB: { icao: "FARB", name: "Richards Bay", lat: -28.741, lon: 32.0921 },
  FAUT: { icao: "FAUT", name: "K.D. Matanzima (Mthatha)", lat: -31.5478, lon: 28.6743 },
  FAPP: { icao: "FAPP", name: "Polokwane Intl", lat: -23.8453, lon: 29.4586 },
  FALW: { icao: "FALW", name: "Langebaanweg", lat: -32.9689, lon: 18.1603 },
  FASH: { icao: "FASH", name: "Stellenbosch", lat: -33.9797, lon: 18.8228 },
  FASB: { icao: "FASB", name: "Springbok", lat: -29.6893, lon: 17.9397 },
};

/** Official Windy webcam players verified by public Windy URL (id after /webcams/). */
const WEBCAMS = [
  {
    id: "1696337816",
    title: "Table Mountain, Cape Town",
    near: ["FACT", "FASH", "FALW"],
    note: "Official Windy webcam about 20 km from Cape Town International — not an airfield camera.",
  },
];


const PRESETS = [
  { label: "FAOR", value: "FAOR" },
  { label: "FACT", value: "FACT" },
  { label: "FALE", value: "FALE" },
  { label: "FALA", value: "FALA" },
  { label: "FAGG", value: "FAGG" },
  { label: "FAPE", value: "FAPE" },
  { label: "FAOR · FACT · FALE", value: "FAOR,FACT,FALE" },
];

const CAPE_FIR = new Set(["FACT", "FAGG", "FAPE", "FALW", "FASH", "FASB", "FAUT"]);

function firFor(icao) {
  return CAPE_FIR.has(String(icao).toUpperCase()) ? "FACA" : "FAJA";
}

module.exports = { AIRPORTS, WEBCAMS, PRESETS, firFor };

