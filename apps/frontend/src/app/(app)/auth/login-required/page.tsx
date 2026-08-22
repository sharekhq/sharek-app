import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export default async function LoginRequiredPage() {
  const t = await getT();
  return (
    /* The hexes are the /auth shell's own (layout.tsx:17), not tokens: this
       panel is fixed inset-0 over the whole funnel, and a theme-aware token
       here would paint a light page inside a deliberately dark funnel on a
       light-themed browser. Recorded as known debt in 021's plan. */
    <div className="fixed left-0 top-0 w-full h-full bg-[#0E0E0E] text-white z-[100] flex justify-center items-center text-4xl">
      {t(
        'login_to_use_the_wizard_to_generate_api_code',
        'Login to use the wizard to generate API code'
      )}
    </div>
  );
}
