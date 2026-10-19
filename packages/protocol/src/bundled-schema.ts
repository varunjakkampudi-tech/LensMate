import protobuf from "protobufjs";
import schemaJson from "./schema.json";

/**
 * The schema compiled to JSON by `pnpm gen:schema`. Used where the .proto file cannot be read
 * at run time, such as the mobile app. CI fails if this file drifts from the .proto source.
 */
export function loadBundledProtocolRoot(): protobuf.Root {
  return protobuf.Root.fromJSON(schemaJson);
}
