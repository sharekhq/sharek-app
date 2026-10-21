import { isSafePublicHttpsUrl } from './webhook.url.validator';

// Every address here is a literal or localhost, so the validator decides
// without a DNS lookup. Node's URL parser rewrites an IPv4-mapped IPv6 host to
// hex ([::ffff:127.0.0.1] arrives as ::ffff:7f00:1), which is the form the
// checks have to recognise.
describe('isSafePublicHttpsUrl', () => {
  it.each([
    ['IPv4-mapped loopback', 'https://[::ffff:127.0.0.1]/x'],
    ['IPv4-mapped cloud metadata', 'https://[::ffff:169.254.169.254]/x'],
    ['IPv4-mapped private network', 'https://[::ffff:10.0.0.5]/x'],
    ['NAT64 of a private IPv4', 'https://[64:ff9b::a00:5]/x'],
    ['6to4 of a private IPv4', 'https://[2002:a00:5::1]/x'],
    ['IPv6 loopback', 'https://[::1]/x'],
    ['localhost', 'https://localhost/x'],
    ['IPv4 loopback', 'https://127.0.0.1/x'],
    ['IPv4 cloud metadata', 'https://169.254.169.254/x'],
    ['10/8', 'https://10.0.0.5/x'],
    ['172.16/12', 'https://172.16.4.2/x'],
    ['192.168/16', 'https://192.168.1.1/x'],
  ])('refuses %s (%s)', async (_label, url) => {
    expect(await isSafePublicHttpsUrl(url)).toBe(false);
  });

  it.each([
    ['a public IPv4', 'https://1.1.1.1/x'],
    ['a public IPv6', 'https://[2606:4700:4700::1111]/x'],
  ])('allows %s (%s)', async (_label, url) => {
    expect(await isSafePublicHttpsUrl(url)).toBe(true);
  });
});
