import { hasKeyword } from "./keywords";

export function isDedicatedTransport(sheet) {
  return hasKeyword(sheet, "DEDICATED TRANSPORT");
}
