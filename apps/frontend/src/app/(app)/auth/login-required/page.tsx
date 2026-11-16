import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export default async function LoginRequiredPage() {
  const t = await getT();
  return (
    // The panel follows the theme, as the /auth shell does.
    <div className="fixed inset-0 bg-newBgColor text-ink z-[100] flex justify-center items-center text-4xl">
      {t(
        'login_to_use_the_wizard_to_generate_api_code',
        'Login to use the wizard to generate API code'
      )}
    </div>
  );
}
