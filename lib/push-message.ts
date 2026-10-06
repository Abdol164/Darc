/**
 * The message a device signs up for approval alerts with. The owner's passkey-derived key
 * signs it, so only the owner can route their alerts to a device, and it names the device's
 * push endpoint so a captured signature cannot sign up a different device. Shared by the
 * browser (which signs it) and the server (which verifies it).
 */
export const subscribeMessage = (owner: string, endpoint: string) =>
  `Send Darc approval requests for ${owner.toLowerCase()} to this device:\n${endpoint}`;
