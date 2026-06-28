import {
  extractGibUserDataStringPatch,
  gibGetUserData,
  gibUpdateUserData,
  mergeGibUserDataPatch,
  type UserData,
} from "./gib.ts";

export async function getUserProfile(username: string): Promise<UserData> {
  return gibGetUserData(username);
}

export async function updateUserProfile(
  username: string,
  patch: Record<string, unknown>,
): Promise<UserData> {
  const picked = extractGibUserDataStringPatch(patch);
  if (Object.keys(picked).length === 0) {
    throw new Error(
      "Güncellenecek alan belirtilmedi. Hangi bilgiyi değiştirmek istediğini yaz.",
    );
  }
  const current = await gibGetUserData(username);
  const merged = mergeGibUserDataPatch(current, picked);
  await gibUpdateUserData(username, merged);
  return gibGetUserData(username);
}
