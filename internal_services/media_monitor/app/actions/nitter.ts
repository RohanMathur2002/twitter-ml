"use server";

import * as nitterService from "@/services/nitterService";
import type { NitterProfile, NitterTweet, NitterTweetsPage } from "@/services/nitterService";

export async function getNitterProfile(username: string, cursor?: string) {
  return nitterService.getNitterProfile(username, cursor);
}

export async function getMoreNitterTweets(
  username: string,
  cursor: string,
  pages?: number
) {
  return nitterService.getMoreNitterTweets(username, cursor, pages);
}

export type { NitterProfile, NitterTweet, NitterTweetsPage };
