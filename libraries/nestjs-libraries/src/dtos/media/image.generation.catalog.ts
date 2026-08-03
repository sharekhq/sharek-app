/**
 * The one source of truth for what the AI image modal can ask for: the four
 * size presets and the 43-style catalog. It lives beside the DTO that validates
 * against it and is imported by the frontend too, so an id cannot drift between
 * what the modal offers, what the DTO accepts and what the locale files label.
 *
 * `label` is the English default the UI passes to `t('image_style_<id>', …)`
 * per the project's i18n convention — the displayed name always comes from the
 * locale files. `prompt` is different: it is written in English and handed to
 * the prompt-enhancement step, never shown.
 */

/**
 * Pixel authority is server-side: the client sends a preset id, never raw
 * dimensions. Both edges of every size are divisible by 16 — gpt-image-2's
 * rule — which is why Story is 1008x1792 rather than an exact 9:16.
 */
export const IMAGE_ASPECT_PRESETS = {
  square: { ratio: '1:1', size: '1024x1024' },
  portrait: { ratio: '4:5', size: '1024x1280' },
  story: { ratio: '9:16', size: '1008x1792' },
  landscape: { ratio: '16:9', size: '1792x1008' },
} as const;

export type ImageAspectId = keyof typeof IMAGE_ASPECT_PRESETS;

export const IMAGE_ASPECT_IDS = Object.keys(
  IMAGE_ASPECT_PRESETS
) as ImageAspectId[];

/**
 * The prompt's ceiling, shared by the DTO that enforces it and the counter that
 * shows it — a field that stops accepting characters without saying why is the
 * failure this replaces. There is no floor: unlike a video prompt, a two-word
 * image prompt is a legitimate request.
 */
export const IMAGE_PROMPT_MAX_CHARS = 2000;

export const IMAGE_STYLE_CATEGORIES = [
  'photography',
  'illustration',
  'three_d_digital',
  'painting_craft',
  'heritage_pattern',
  'minimal_bold',
] as const;

export type ImageStyleCategory = (typeof IMAGE_STYLE_CATEGORIES)[number];

/** English defaults for the `image_style_cat_<id>` locale keys. */
export const IMAGE_STYLE_CATEGORY_LABELS: Record<ImageStyleCategory, string> = {
  photography: 'Photography',
  illustration: 'Illustration',
  three_d_digital: '3D & digital',
  painting_craft: 'Painting & craft',
  heritage_pattern: 'Heritage & pattern',
  minimal_bold: 'Minimal & bold',
};

export interface ImageStyle {
  id: string;
  category: ImageStyleCategory;
  /** English default for the `image_style_<id>` locale key. */
  label: string;
  /** English style phrase handed to the enhancement step; never displayed. */
  prompt: string;
}

/**
 * Grouped by category in the order the catalog renders them. "Auto" is a UI
 * sentinel rather than an entry: choosing it omits `style` from the request, so
 * nothing is imposed on the prompt.
 */
export const IMAGE_STYLES: ImageStyle[] = [
  // Photography
  {
    id: 'realistic_photo',
    category: 'photography',
    label: 'Realistic Photo',
    prompt: 'a realistic photograph',
  },
  {
    id: 'cinematic',
    category: 'photography',
    label: 'Cinematic',
    prompt: 'a cinematic film still',
  },
  {
    id: 'studio_portrait',
    category: 'photography',
    label: 'Studio Portrait',
    prompt: 'a studio portrait lit with a soft key light',
  },
  {
    id: 'product_shot',
    category: 'photography',
    label: 'Product Shot',
    prompt: 'a clean studio product shot on a seamless backdrop',
  },
  {
    id: 'food_photography',
    category: 'photography',
    label: 'Food Photography',
    prompt: 'appetising food photography in natural light',
  },
  {
    id: 'aerial',
    category: 'photography',
    label: 'Aerial',
    prompt: 'an aerial drone photograph looking down on the scene',
  },
  {
    id: 'macro',
    category: 'photography',
    label: 'Macro',
    prompt: 'an extreme macro photograph with a shallow depth of field',
  },
  {
    id: 'golden_hour',
    category: 'photography',
    label: 'Golden Hour',
    prompt: 'a photograph in warm low golden-hour light',
  },
  {
    id: 'black_and_white',
    category: 'photography',
    label: 'Black & White',
    prompt: 'a black and white photograph with rich contrast',
  },

  // Illustration
  {
    id: 'flat_illustration',
    category: 'illustration',
    label: 'Flat Illustration',
    prompt: 'a flat vector illustration in solid shapes',
  },
  {
    id: 'line_art',
    category: 'illustration',
    label: 'Line Art',
    prompt: 'a clean single-weight line drawing',
  },
  {
    id: 'cartoon',
    category: 'illustration',
    label: 'Cartoon',
    prompt: 'a playful cartoon illustration with bold outlines',
  },
  {
    id: 'anime',
    category: 'illustration',
    label: 'Anime',
    prompt: 'an anime illustration with cel shading',
  },
  {
    id: 'comic',
    category: 'illustration',
    label: 'Comic',
    prompt: 'a comic-book panel with inked linework and halftone shading',
  },
  {
    id: 'storybook',
    category: 'illustration',
    label: 'Storybook',
    prompt: "a warm children's storybook illustration",
  },
  {
    id: 'doodle',
    category: 'illustration',
    label: 'Doodle',
    prompt: 'a loose hand-drawn doodle',
  },

  // 3D & digital
  {
    id: 'three_d_render',
    category: 'three_d_digital',
    label: '3D Render',
    prompt: 'a polished 3D render with soft studio lighting',
  },
  {
    id: 'claymation',
    category: 'three_d_digital',
    label: 'Claymation',
    prompt: 'a claymation scene modelled in soft plasticine',
  },
  {
    id: 'isometric',
    category: 'three_d_digital',
    label: 'Isometric',
    prompt: 'an isometric 3D illustration',
  },
  {
    id: 'low_poly',
    category: 'three_d_digital',
    label: 'Low Poly',
    prompt: 'a low-poly 3D render of faceted flat-shaded geometry',
  },
  {
    id: 'pixel_art',
    category: 'three_d_digital',
    label: 'Pixel Art',
    prompt: 'pixel art on a coarse pixel grid with a limited palette',
  },
  {
    id: 'cyberpunk',
    category: 'three_d_digital',
    label: 'Cyberpunk',
    prompt: 'a cyberpunk scene of rain-slick streets and saturated haze',
  },
  {
    id: 'neon',
    category: 'three_d_digital',
    label: 'Neon',
    prompt: 'a neon-lit scene glowing in saturated colour against darkness',
  },

  // Painting & craft
  {
    id: 'watercolor',
    category: 'painting_craft',
    label: 'Watercolor',
    prompt: 'a watercolour painting with soft bleeding washes',
  },
  {
    id: 'oil_painting',
    category: 'painting_craft',
    label: 'Oil Painting',
    prompt: 'an oil painting with visible brushwork and thick impasto',
  },
  {
    id: 'pastel',
    category: 'painting_craft',
    label: 'Pastel',
    prompt: 'a soft pastel drawing on textured paper',
  },
  {
    id: 'gouache',
    category: 'painting_craft',
    label: 'Gouache',
    prompt: 'a gouache painting in flat matte colour',
  },
  {
    id: 'pencil_sketch',
    category: 'painting_craft',
    label: 'Pencil Sketch',
    prompt: 'a graphite pencil sketch with hatched shading',
  },
  {
    id: 'paper_cutout',
    category: 'painting_craft',
    label: 'Paper Cutout',
    prompt: 'a layered paper cutout scene casting soft shadows',
  },
  {
    id: 'collage',
    category: 'painting_craft',
    label: 'Collage',
    prompt: 'a mixed-media collage of torn paper and printed textures',
  },

  // Heritage & pattern
  {
    id: 'arabic_calligraphy',
    category: 'heritage_pattern',
    label: 'Arabic Calligraphy',
    prompt: 'Arabic calligraphy artwork with flowing measured strokes in ink',
  },
  {
    id: 'islamic_geometric',
    category: 'heritage_pattern',
    label: 'Islamic Geometric',
    prompt: 'an Islamic geometric pattern of interlocking stars and polygons',
  },
  {
    id: 'arabesque',
    category: 'heritage_pattern',
    label: 'Arabesque',
    prompt: 'an arabesque ornament of interlacing vines and floral motifs',
  },
  {
    id: 'mosaic',
    category: 'heritage_pattern',
    label: 'Mosaic',
    prompt: 'a mosaic assembled from small glazed tiles',
  },
  {
    id: 'miniature_painting',
    category: 'heritage_pattern',
    label: 'Miniature Painting',
    prompt:
      'a Persian miniature painting with fine detail and a flattened perspective',
  },

  // Minimal & bold
  {
    id: 'minimalist',
    category: 'minimal_bold',
    label: 'Minimalist',
    prompt: 'a minimalist composition with generous negative space',
  },
  {
    id: 'abstract',
    category: 'minimal_bold',
    label: 'Abstract',
    prompt: 'an abstract composition of shape and colour',
  },
  {
    id: 'pop_art',
    category: 'minimal_bold',
    label: 'Pop Art',
    prompt: 'a bold pop-art illustration in flat primary colour',
  },
  {
    id: 'surreal',
    category: 'minimal_bold',
    label: 'Surreal',
    prompt: 'a surreal dreamlike scene of impossible juxtapositions',
  },
  {
    id: 'monochrome',
    category: 'minimal_bold',
    label: 'Monochrome',
    prompt: 'a monochrome composition in a single hue',
  },
  {
    id: 'vintage_poster',
    category: 'minimal_bold',
    label: 'Vintage Poster',
    prompt: 'a vintage travel-poster illustration in faded print colour',
  },
  {
    id: 'retro',
    category: 'minimal_bold',
    label: 'Retro',
    prompt: 'a retro seventies design in warm muted colour',
  },
  {
    id: 'bauhaus',
    category: 'minimal_bold',
    label: 'Bauhaus',
    prompt: 'a Bauhaus-inspired design of primary colour and hard geometry',
  },
];

export const IMAGE_STYLE_IDS = IMAGE_STYLES.map((style) => style.id);

/**
 * The collapsed row's six, in the order it shows them — which is not catalog
 * order, so this is an ordered list rather than a flag on each entry.
 */
export const IMAGE_POPULAR_STYLE_IDS = [
  'realistic_photo',
  'flat_illustration',
  'cartoon',
  'three_d_render',
  'minimalist',
  'watercolor',
];

export const IMAGE_POPULAR_STYLES = IMAGE_POPULAR_STYLE_IDS.map(
  (id) => IMAGE_STYLES.find((style) => style.id === id) as ImageStyle
);
