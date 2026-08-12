import { createHash } from "node:crypto";

export const PORTRAIT_STANDARD = Object.freeze({
  promptVersion: "2.0.0",
  size: "1280x1600",
  outputFormat: "webp",
  source: "Extern in ChatGPT erzeugt und manuell geprüft",
});

export const PORTRAIT_OPTION_DEFAULTS = Object.freeze({
  motif: "automatic",
  gender: "automatic",
  lifeStage: "automatic",
  crop: "automatic",
  detailSubject: "",
  bodyOrientation: "automatic",
  headDirection: "automatic",
  perspective: "automatic",
  behavior: "automatic",
  food: "none",
  habitat: "subtle",
  timeOfDay: "automatic",
  season: "automatic",
  classOptions: Object.freeze({}),
});

const OPTION_VALUES = Object.freeze({
  motif: new Set(["automatic", "single", "juvenile", "adult-with-young", "pair", "small-group"]),
  gender: new Set(["automatic", "male", "female", "unspecified"]),
  lifeStage: new Set(["automatic", "adult", "juvenile"]),
  crop: new Set(["automatic", "full-body", "expanded-portrait", "detail"]),
  bodyOrientation: new Set([
    "automatic", "left-profile", "right-profile", "frontal", "three-quarter-left", "three-quarter-right",
  ]),
  headDirection: new Set(["automatic", "left", "right", "camera", "movement"]),
  perspective: new Set(["automatic", "eye-level", "ground-level", "slightly-elevated", "macro", "underwater"]),
  behavior: new Set([
    "automatic", "resting", "standing", "sitting", "walking", "climbing", "swimming", "flying", "feeding", "hunting",
  ]),
  food: new Set(["none", "typical-food", "typical-prey", "prey-held"]),
  habitat: new Set(["minimal", "subtle", "clear"]),
  timeOfDay: new Set(["automatic", "day", "dawn", "dusk", "night"]),
  season: new Set(["automatic", "spring", "summer", "autumn", "winter"]),
});

const CLASS_OPTION_VALUES = Object.freeze({
  birdPlumage: new Set(["automatic", "breeding", "nonbreeding", "juvenile"]),
  wingPosition: new Set(["automatic", "folded", "spread", "in-flight"]),
  birdSubstrate: new Set(["automatic", "branch", "ground", "water", "rock"]),
  mammalCoat: new Set(["automatic", "summer", "winter", "juvenile"]),
  socialForm: new Set(["automatic", "solitary", "pair", "family", "group"]),
  mammalFeature: new Set(["automatic", "antlers", "mane", "horns", "no-emphasis"]),
  reptileSurface: new Set(["automatic", "dry", "wet", "shedding"]),
  thermoregulation: new Set(["automatic", "basking", "shade", "active"]),
  amphibianPhase: new Set(["automatic", "terrestrial", "aquatic", "metamorphosis"]),
  moisture: new Set(["automatic", "dry", "moist", "wet"]),
  fishEnvironment: new Set(["automatic", "freshwater", "marine", "brackish", "reef", "open-water", "bottom"]),
  fishPosition: new Set(["automatic", "side-view", "three-quarter", "school"]),
  insectStage: new Set(["automatic", "adult", "larva", "pupa"]),
  insectWings: new Set(["automatic", "folded", "spread", "in-flight"]),
  arachnidContext: new Set(["automatic", "without-web", "on-web", "burrow"]),
  crustaceanEnvironment: new Set(["automatic", "marine", "freshwater", "shore", "terrestrial"]),
  invertebrateEnvironment: new Set(["automatic", "marine", "freshwater", "terrestrial", "substrate"]),
});

function allowedValue(group, value, fallback) {
  const normalized = String(value ?? "").trim();
  return OPTION_VALUES[group]?.has(normalized) ? normalized : fallback;
}

export function normalizePortraitOptions(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const classSource = source.classOptions && typeof source.classOptions === "object"
    && !Array.isArray(source.classOptions)
    ? source.classOptions
    : {};
  const classOptions = {};
  for (const [key, values] of Object.entries(CLASS_OPTION_VALUES)) {
    const value = String(classSource[key] ?? "automatic").trim();
    if (values.has(value) && value !== "automatic") classOptions[key] = value;
  }
  return {
    motif: allowedValue("motif", source.motif, PORTRAIT_OPTION_DEFAULTS.motif),
    gender: allowedValue("gender", source.gender, PORTRAIT_OPTION_DEFAULTS.gender),
    lifeStage: allowedValue("lifeStage", source.lifeStage, PORTRAIT_OPTION_DEFAULTS.lifeStage),
    crop: allowedValue("crop", source.crop, PORTRAIT_OPTION_DEFAULTS.crop),
    detailSubject: String(source.detailSubject ?? "").trim().slice(0, 120),
    bodyOrientation: allowedValue(
      "bodyOrientation",
      source.bodyOrientation,
      PORTRAIT_OPTION_DEFAULTS.bodyOrientation,
    ),
    headDirection: allowedValue(
      "headDirection",
      source.headDirection,
      PORTRAIT_OPTION_DEFAULTS.headDirection,
    ),
    perspective: allowedValue("perspective", source.perspective, PORTRAIT_OPTION_DEFAULTS.perspective),
    behavior: allowedValue("behavior", source.behavior, PORTRAIT_OPTION_DEFAULTS.behavior),
    food: allowedValue("food", source.food, PORTRAIT_OPTION_DEFAULTS.food),
    habitat: allowedValue("habitat", source.habitat, PORTRAIT_OPTION_DEFAULTS.habitat),
    timeOfDay: allowedValue("timeOfDay", source.timeOfDay, PORTRAIT_OPTION_DEFAULTS.timeOfDay),
    season: allowedValue("season", source.season, PORTRAIT_OPTION_DEFAULTS.season),
    classOptions,
  };
}

export function validatePortraitOptions(input = {}) {
  const options = normalizePortraitOptions(input);
  const errors = [];
  if (options.crop === "detail" && !options.detailSubject) {
    errors.push("Bei einer Detailaufnahme muss das Detailmotiv angegeben werden, z. B. Pfote, Schnabel oder Auge");
  }
  if (options.motif === "juvenile" && options.lifeStage === "adult") {
    errors.push("Jungtier als Motiv und adultes Lebensstadium widersprechen sich");
  }
  return { options, errors };
}

const phrase = (map, value, fallback = "") => map[value] || fallback;

function compositionGuidance(options) {
  const subjects = {
    automatic: "Depict exactly one recognizable individual animal.",
    single: "Depict exactly one individual animal.",
    juvenile: "Depict exactly one recognizable juvenile specimen.",
    "adult-with-young": "Depict exactly one adult together with exactly one juvenile of the same species.",
    pair: "Depict exactly one natural pair of two conspecific adult animals.",
    "small-group": "Depict one small natural group of three to five conspecific animals.",
  };
  const gender = phrase({
    male: "Depict the male sex with accurate sex-specific characteristics.",
    female: "Depict the female sex with accurate sex-specific characteristics.",
    unspecified: "Do not emphasize sex-specific characteristics.",
  }, options.gender);
  const stage = options.lifeStage === "automatic"
    ? (options.motif === "juvenile" ? "" : "Use the adult life stage unless another stage is explicitly requested.")
    : phrase({
      adult: "Use the adult life stage.",
      juvenile: "Use the juvenile life stage.",
    }, options.lifeStage);
  const crop = options.crop === "detail"
    ? `Create an intentional close detail study of: ${options.detailSubject}. Keep the entire selected detail clearly visible and scientifically useful.`
    : phrase({
      automatic: "Show the complete animal whenever anatomically possible.",
      "full-body": "Show the complete animal from head to the tips of every limb and tail.",
      "expanded-portrait": "Use a wider environmental portrait while keeping the animal dominant and fully recognizable.",
    }, options.crop);
  return [subjects[options.motif], gender, stage, crop].filter(Boolean);
}

function poseGuidance(options) {
  return [
    phrase({
      "left-profile": "Orient the body in a clean left-facing profile.",
      "right-profile": "Orient the body in a clean right-facing profile.",
      frontal: "Orient the body frontally toward the viewer.",
      "three-quarter-left": "Orient the body in a natural three-quarter view facing left.",
      "three-quarter-right": "Orient the body in a natural three-quarter view facing right.",
    }, options.bodyOrientation, "Choose the most informative natural body orientation for this species."),
    phrase({
      left: "Turn the head and gaze naturally to the left.",
      right: "Turn the head and gaze naturally to the right.",
      camera: "Direct the animal's gaze toward the viewer without making the pose unnatural.",
      movement: "Direct the head and gaze naturally into the direction of movement.",
    }, options.headDirection, "Choose a natural head direction and gaze."),
    phrase({
      "eye-level": "Use an eye-level perspective.",
      "ground-level": "Use a low, ground-level perspective.",
      "slightly-elevated": "Use a slightly elevated perspective.",
      macro: "Use a scientifically useful macro perspective.",
      underwater: "Use a natural underwater perspective.",
    }, options.perspective, "Choose the most natural and informative perspective."),
    phrase({
      resting: "Show the animal resting naturally.",
      standing: "Show the animal standing naturally.",
      sitting: "Show the animal sitting naturally.",
      walking: "Show the animal walking naturally.",
      climbing: "Show the animal climbing naturally.",
      swimming: "Show the animal swimming naturally.",
      flying: "Show the animal in natural flight.",
      feeding: "Show a natural feeding behavior.",
      hunting: "Show natural hunting behavior without gore.",
    }, options.behavior, "Choose a calm, characteristic natural posture or activity."),
  ];
}

function environmentGuidance(options) {
  const food = phrase({
    none: "Do not show food, prey, carcasses, or captured animals.",
    "typical-food": "Include a small amount of scientifically accurate typical food only if it supports the selected behavior.",
    "typical-prey": "Include one scientifically accurate typical prey item without gore.",
    "prey-held": "Show one scientifically accurate prey item naturally held in the beak, mouth, claws, or appendages without gore.",
  }, options.food);
  const habitat = phrase({
    minimal: "Use only one minimal species-appropriate support element; do not depict a wider habitat.",
    subtle: "Suggest the species' scientifically accurate natural habitat subtly and recognizably with softly fading watercolor detail. Keep it understated and verify that it truly matches this species.",
    clear: "Show the species' scientifically accurate natural habitat clearly and recognizably, while keeping the animal as the dominant subject.",
  }, options.habitat);
  const time = phrase({
    day: "Use natural daytime lighting.",
    dawn: "Use subtle natural dawn lighting.",
    dusk: "Use subtle natural dusk lighting.",
    night: "Use natural low night lighting while preserving diagnostic colors and details.",
  }, options.timeOfDay, "Use the time of day most characteristic for the selected species and behavior, with neutral readable lighting.");
  const season = phrase({
    spring: "Depict an accurate spring condition.",
    summer: "Depict an accurate summer condition.",
    autumn: "Depict an accurate autumn condition.",
    winter: "Depict an accurate winter condition.",
  }, options.season, "Use a neutral or biologically appropriate seasonal condition.");
  return [food, habitat, time, season];
}

function classGuidance(className, options) {
  const values = options.classOptions;
  const lines = [];
  const add = (map, key) => {
    const value = values[key];
    if (value && map[value]) lines.push(map[value]);
  };
  add({
    breeding: "Use accurate adult breeding plumage.",
    nonbreeding: "Use accurate adult non-breeding plumage.",
    juvenile: "Use accurate juvenile plumage.",
  }, "birdPlumage");
  add({
    folded: "Keep both wings naturally folded.",
    spread: "Show both wings fully and anatomically correctly spread.",
    "in-flight": "Show anatomically correct wing posture in flight.",
  }, "wingPosition");
  add({
    branch: "Place the bird naturally on a species-appropriate branch or perch.",
    ground: "Place the bird naturally on species-appropriate ground.",
    water: "Place the bird naturally on or at species-appropriate water.",
    rock: "Place the bird naturally on a species-appropriate rock.",
  }, "birdSubstrate");
  add({ summer: "Use accurate summer coat.", winter: "Use accurate winter coat.", juvenile: "Use accurate juvenile coat." }, "mammalCoat");
  add({ solitary: "Show a solitary social setting.", pair: "Show a natural pair.", family: "Show a natural family group.", group: "Show a small natural social group." }, "socialForm");
  add({ antlers: "Emphasize anatomically accurate antlers.", mane: "Emphasize the anatomically accurate mane.", horns: "Emphasize anatomically accurate horns.", "no-emphasis": "Do not specially emphasize sex-specific ornaments." }, "mammalFeature");
  add({ dry: "Render the skin and scales naturally dry.", wet: "Render the skin or scales naturally wet.", shedding: "Show a scientifically plausible shedding condition." }, "reptileSurface");
  add({ basking: "Show natural basking behavior.", shade: "Show a natural shaded resting position.", active: "Show natural active thermoregulation behavior." }, "thermoregulation");
  add({ terrestrial: "Show the terrestrial life phase.", aquatic: "Show the aquatic life phase.", metamorphosis: "Show the selected metamorphic life phase accurately." }, "amphibianPhase");
  add({ dry: "Use a naturally dry skin surface.", moist: "Use a naturally moist skin surface.", wet: "Use a naturally wet skin surface." }, "moisture");
  add({ freshwater: "Use a scientifically accurate freshwater setting.", marine: "Use a scientifically accurate marine setting.", brackish: "Use a scientifically accurate brackish-water setting.", reef: "Use a scientifically accurate reef setting.", "open-water": "Use a scientifically accurate open-water setting.", bottom: "Use a scientifically accurate bottom-associated setting." }, "fishEnvironment");
  add({ "side-view": "Show a clear complete lateral fish view.", "three-quarter": "Show a natural three-quarter fish view.", school: "Show a small natural conspecific school." }, "fishPosition");
  add({ adult: "Show the adult insect stage.", larva: "Show the larval stage.", pupa: "Show the pupal stage." }, "insectStage");
  add({ folded: "Keep the wings naturally folded.", spread: "Show all wings anatomically correctly spread.", "in-flight": "Show anatomically correct wings in flight." }, "insectWings");
  add({ "without-web": "Do not show a web.", "on-web": "Place the animal on a species-appropriate web.", burrow: "Show a subtle species-appropriate burrow context." }, "arachnidContext");
  add({ marine: "Use a marine context.", freshwater: "Use a freshwater context.", shore: "Use a shore or intertidal context.", terrestrial: "Use a terrestrial context." }, "crustaceanEnvironment");
  add({ marine: "Use a marine context.", freshwater: "Use a freshwater context.", terrestrial: "Use a terrestrial context.", substrate: "Use the species-appropriate substrate." }, "invertebrateEnvironment");
  if (!lines.length) {
    lines.push(`Choose all class-specific traits automatically and accurately for taxonomic class ${String(className || "unknown").trim() || "unknown"}.`);
  }
  return lines;
}

export function buildPortraitPrompt({
  germanName,
  scientificName,
  taxonomyClass = "",
  portraitOptions = {},
  additionalInstructions = "",
}) {
  const optionalInstructions = String(additionalInstructions ?? "").trim();
  const options = normalizePortraitOptions(portraitOptions);
  const scientific = String(scientificName ?? "").trim();
  const composition = compositionGuidance(options).map((line) => `- ${line}`).join("\n");
  const pose = poseGuidance(options).map((line) => `- ${line}`).join("\n");
  const environment = environmentGuidance(options).map((line) => `- ${line}`).join("\n");
  const classSpecific = classGuidance(taxonomyClass, options).map((line) => `- ${line}`).join("\n");
  const permitsMultipleAnimals = ["adult-with-young", "pair", "small-group"].includes(options.motif);
  const permitsPrey = options.food !== "none";
  const fullBodyExclusion = options.crop === "detail"
    ? "- Do not crop through the selected detail subject."
    : "- No cropped limbs, tail, wings, beak, fins, or feet.";

  return `Create exactly one single standalone image containing one scientifically accurate natural-history illustration of the following animal species.

HARD OUTPUT CONSTRAINTS — ONE IMAGE ONLY
- Return exactly one image for exactly one species in this response.
- Do not create a collage, image grid, contact sheet, diptych, triptych, storyboard, comparison plate, multi-panel layout, or collection of alternatives.
- Do not show multiple poses, multiple views, alternate variants, or separate detail insets.
- Do not divide the canvas into panels or sections.
- If other species prompts appear before or after this prompt block, ignore them for the current image. Process only the species named directly below.
- After creating this one image, stop. Do not automatically create another species.

German common name: ${String(germanName ?? "").trim()}
Scientific name: ${scientific}
Taxonomic class: ${String(taxonomyClass ?? "").trim() || "determine automatically from the scientific name"}

STYLE STANDARD
- Traditional natural-history plate rendered as detailed watercolor with fine colored-pencil linework.
- Realistic and scientifically informative, while remaining visibly hand-painted rather than photographic.
- Warm ivory watercolor-paper background with a very subtle natural paper texture.
- Softly fading watercolor edges around habitat and supporting elements.
- Neutral, readable lighting without dramatic shadows.
- Use natural, restrained colors. Avoid artificial saturation, glossy digital effects, cartoon styling, and photorealism.

SPECIES ACCURACY
- Accurately reproduce species-specific anatomy, proportions, coloration, plumage, fur, scales, beak, eyes, ears, limbs, feet, claws, fins, tail, and diagnostic markings.
- Do not invent, combine, exaggerate, omit, duplicate, or deform anatomical features.
- Do not introduce characteristics from similar or related species.
- Resolve automatic choices from reliable biological knowledge of ${scientific}, never from a generic habitat or related species.

SUBJECT AND CROP
${composition}

BODY, GAZE, PERSPECTIVE, AND BEHAVIOR
${pose}

HABITAT, FOOD, LIGHT, AND SEASON
${environment}

CLASS-SPECIFIC REQUIREMENTS
${classSpecific}

COMPOSITION SAFETY
- Use a vertical 4:5 composition.
- Keep every important depicted body part or selected detail fully inside the image.
- Leave generous safe margins around the animal and its diagnostic features.
- Leave slightly more open space in the direction the animal is facing or moving.
- Keep the animal as the unmistakable primary subject.

EXCLUSIONS
${permitsMultipleAnimals ? "- Do not add any animals beyond the explicitly requested conspecific subjects." : "- No second animal of the depicted species."}
${permitsPrey ? "- Do not add food or prey beyond the one explicitly requested item." : "- No prey, food, carcasses, or captured animals."}
- No generic or biologically incorrect habitat, decorative scenery, border, frame, text, caption, scientific label, signature, logo, or watermark.
- No collage, grid, contact sheet, multiple panels, alternate versions, inset details, or repeated depiction of the animal.
${fullBodyExclusion}
- No fantasy elements and no gore.

FINAL CHECK
- Before finishing, verify the number and shape of all visible limbs, toes, claws, wings, fins, teeth, ears, eyes, and tail structures.
- Verify that the diagnostic markings, habitat, behavior, season, and food belong specifically to ${scientific}.
- Verify that the requested number of animals and only that number is visible.

OUTPUT
- Use a vertical 4:5 canvas.
- Create the highest available image quality.
- Keep the warm ivory paper background opaque.
- Do not add text, labels, logos, signatures, borders, or watermarks.
${optionalInstructions ? `
ADDITIONAL USER INSTRUCTIONS
${optionalInstructions}
` : ""}`.trim();
}

export function portraitPromptSha256(prompt) {
  return createHash("sha256").update(String(prompt ?? "")).digest("hex");
}
