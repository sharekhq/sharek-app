/* v3 categorical slots, fixed order — same hash everywhere a customer wears
   a color, so a customer keeps one hue across the app. With more than six
   customers the slots cycle (standard categorical-palette behavior; the six
   hues are the CVD-validated set). */
export const CUSTOMER_HUES = [
  'bg-catPomegranate',
  'bg-catSaffron',
  'bg-catFayrouz',
  'bg-catPalm',
  'bg-catLapis',
  'bg-catClay',
];

export const customerHue = (name: string) =>
  CUSTOMER_HUES[
    Math.abs(
      [...name].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0)
    ) % CUSTOMER_HUES.length
  ];
