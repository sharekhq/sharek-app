// Branded transactional-email chrome. Lives in helpers (not nestjs-libraries) so it stays a
// pure string transform, testable under the fork's scoped jest config.
const BRAND_LINK_STYLE = 'color:#B92D43;font-weight:600;';
const FONT_STACK =
  "'IBM Plex Sans','IBM Plex Sans Arabic',-apple-system,'Segoe UI',Arial,sans-serif";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Email fragments have no <head>, so Gmail ignores <style> blocks — links must carry the
// brand colour inline. Digest bodies contain bare URLs; linkify those in the same pass.
export function brandEmailLinks(html: string): string {
  const linkified = html.replace(/(?<!["'>])https?:\/\/[^\s<]+/g, (url) => {
    const clean = url.replace(/[.,;:)\]]+$/, '');
    const rest = url.slice(clean.length);
    return `<a href="${clean}">${clean}</a>${rest}`;
  });
  return linkified.replace(
    /<a (?![^>]*style=)/g,
    `<a style="${BRAND_LINK_STYLE}" `
  );
}

export function renderBrandedEmail(
  subject: string,
  html: string,
  frontendUrl: string
): string {
  const year = new Date().getFullYear();
  return `
<style>@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FBFAF9;">
  <tr>
    <td align="center" style="padding:36px 24px 0;">
      <a href="${frontendUrl}" style="text-decoration:none;"><img src="${frontendUrl}/email-logo.png" width="117" height="34" alt="Sharek" style="display:block;border:0;"></a>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:26px 24px 0;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" align="center" style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #CFC9C6;border-radius:18px;box-shadow:0 1px 2px rgba(26,20,19,0.04),0 6px 16px -8px rgba(26,20,19,0.11);">
        <tr>
          <td style="padding:36px 40px 0;font-family:${FONT_STACK};text-align:left;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.35;font-weight:600;color:#1A1413;">${escapeHtml(
              subject
            )}</h1>
            <div style="font-size:15px;line-height:1.6;color:#2A2724;word-break:break-word;">${brandEmailLinks(
              html
            )}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 40px 28px;font-family:${FONT_STACK};text-align:left;">
            <div style="border-top:1px solid #E9E6E4;padding-top:18px;">
              <div style="font-size:12px;line-height:1.6;color:#6F635F;">You can change your notification preferences in your <a href="${frontendUrl}/settings" style="color:#B92D43;font-weight:500;">account settings</a>.</div>
            </div>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:18px 24px 40px;font-family:${FONT_STACK};">
      <div style="font-size:12px;line-height:1.7;color:#6F635F;">&copy; ${year} Sharek</div>
      <div style="font-size:11.5px;line-height:1.6;color:#6F635F;margin:10px auto 0;max-width:360px;">You&rsquo;re receiving this email to keep you up to date on important activity in your Sharek account.</div>
    </td>
  </tr>
</table>`;
}
