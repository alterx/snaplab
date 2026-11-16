// Free filters by Turtle Bard at https://campersnapper.com/filters.
// Loaded live from their site (it serves .flt files with CORS enabled), not rehosted here.
export const CAMPER_SNAPPER_SITE = "https://campersnapper.com/filters";
const BASE = "https://campersnapper.com/filters/";

export const CAMPER_SNAPPER = [
  ["Art Club", "35mm filmulation", "Sweeping highlights and boosted colour."],
  ["Eternia", "Cine filmulation", "Dependable all-rounder; a solid base for further edits."],
  ["Narnia", "Cine filmulation", "Balanced colour with a touch of whimsy."],
  ["Polar", "Instant filmulation", "Cold, peel-apart instant film take."],
  ["Ripley", "Instant filmulation", "Tough retro-future instant film."],
  ["Rushmore", "35mm filmulation", "Maxed-out colour with chrome-style contrast."],
  ["Supra", "35mm filmulation", "Healthy contrast that kicks colours into high gear."],
  ["Boom Boom", "Filmic", "Knocks down greens, punches up skin tones."],
  ["Bubblegum", "Soft", "Soft, with pops of colour."],
  ["Cross Pross", "Filmic", "Cool-toned cross-processed film."],
  ["Grunge", "Utility", "Dirtier shadows, turned-down highlights."],
  ["Midas", "Utility", "Just a touch of gold."],
  ["Shoebox", "Vintage", "Heavy faded-print look, like old photos in a shoebox."],
  ["White Wedding", "Utility", "Small highlight boost and a little contrast."],
  ["Zeus", "Flash friendly", "Balanced for indoor flash selfies, like old instant cameras."],
].map(([name, kind, desc]) => {
  const file = `${name.replace(/ /g, "-")}-Camper-Snapper.flt`;
  return { name, kind, desc, file, url: BASE + file };
});
