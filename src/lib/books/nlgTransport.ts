import { Agent, request } from 'node:https';
import { rootCertificates } from 'node:tls';

/**
 * HTTPS transport for catalogue.nlg.gr.
 *
 * The catalogue's server sends only its own certificate and leaves out the
 * intermediate that signed it, so a standard client cannot build the chain
 * and Node rejects the connection (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Browsers
 * hide this by fetching the missing intermediate themselves; Node does not.
 *
 * The fix is to supply that public intermediate here, next to Node's normal
 * root store. Verification stays fully on: the chain still has to end at a
 * trusted root (HARICA TLS ECC Root CA 2021) and the hostname still has to
 * match. Nothing is relaxed — the server's missing piece is just provided.
 *
 * GEANT TLS ECC 1, issued by HARICA TLS ECC Root CA 2021
 * Source: http://crt.harica.gr/HARICA-GEANT-TLS-E1.cer (the certificate's AIA URL)
 * SHA-256: 6C:DF:0B:A1:71:1E:85:6D:22:8B:A0:0C:A0:4C:5C:1C:3D:79:94:4C:03:7B:71:3B:15:5A:4E:E4:B4:7E:C5:3C
 * Valid until 2039-12-31. If NLG fixes its chain this stays harmless.
 */
const GEANT_TLS_ECC_1 = `-----BEGIN CERTIFICATE-----
MIIDNzCCArygAwIBAgIQQv3c4SYWB+Gl5pNaQAFh3TAKBggqhkjOPQQDAzBsMQsw
CQYDVQQGEwJHUjE3MDUGA1UECgwuSGVsbGVuaWMgQWNhZGVtaWMgYW5kIFJlc2Vh
cmNoIEluc3RpdHV0aW9ucyBDQTEkMCIGA1UEAwwbSEFSSUNBIFRMUyBFQ0MgUm9v
dCBDQSAyMDIxMB4XDTI1MDEwMzExMTQyMVoXDTM5MTIzMTExMTQyMFowYDELMAkG
A1UEBhMCR1IxNzA1BgNVBAoMLkhlbGxlbmljIEFjYWRlbWljIGFuZCBSZXNlYXJj
aCBJbnN0aXR1dGlvbnMgQ0ExGDAWBgNVBAMMD0dFQU5UIFRMUyBFQ0MgMTB2MBAG
ByqGSM49AgEGBSuBBAAiA2IABANPWLwh0Za2UqtbLV7/qNRm78zsttgSuvhn73bU
GtxETsVOEZeMUfMjgHw8EwrsSJI9oj0CgZQFFSEY1NJfcxA/NJiOYJUKPsFbpOrY
dr0q4g+aBZsXWeh7bMCzx24g/aOCAS0wggEpMBIGA1UdEwEB/wQIMAYBAf8CAQAw
HwYDVR0jBBgwFoAUyRtTgRL+BNUW0aq8mm+3oJUZbsowTQYIKwYBBQUHAQEEQTA/
MD0GCCsGAQUFBzAChjFodHRwOi8vY3J0LmhhcmljYS5nci9IQVJJQ0EtVExTLVJv
b3QtMjAyMS1FQ0MuY2VyMBEGA1UdIAQKMAgwBgYEVR0gADAdBgNVHSUEFjAUBggr
BgEFBQcDAgYIKwYBBQUHAwEwQgYDVR0fBDswOTA3oDWgM4YxaHR0cDovL2NybC5o
YXJpY2EuZ3IvSEFSSUNBLVRMUy1Sb290LTIwMjEtRUNDLmNybDAdBgNVHQ4EFgQU
6ZkGjRcfq/uWGlrIW15dXuzanI8wDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMD
A2kAMGYCMQD2M1caaY2OwmthgmANUQg3LBLI0/2LiCdxa2zNq0G59wVzbjEk0cR/
px52OegIwRACMQCk+iTmBlR6Xfv6igiiaFiPYfN2HfbcYLWbot5DZ2H1b4JVJV+V
rga7uu50SDG9hf4=
-----END CERTIFICATE-----`;

const REQUEST_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

let agent: Agent | null = null;
const getAgent = () => {
  agent ??= new Agent({ ca: [...rootCertificates, GEANT_TLS_ECC_1], keepAlive: true });
  return agent;
};

/** GET a catalogue URL and return the body as text. */
export function fetchNlgText(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', agent: getAgent(), headers }, res => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          req.destroy(new Error('NLG response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
      );
      res.on('error', reject);
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('NLG request timed out')));
    req.on('error', reject);
    req.end();
  });
}
