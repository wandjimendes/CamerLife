import { MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") familyName = "";
  @type("uint8") hair = 0;
  @type("uint8") skin = 0;
  @type("uint8") clothes = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") dir = "down";
  @type("boolean") moving = false;
  /** Building slug the player is inside (hidden from the street), or "". */
  @type("string") inside = "";
  @type("boolean") working = false;
}

export class TownState extends Schema {
  @type("string") townId = "";
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
