import { MapSchema, Schema, type } from "@colyseus/schema";
import { PlayerSchema } from "./TownState.ts";

export class FurnitureSchema extends Schema {
  @type("string") id = "";
  @type("string") key = "";
  @type("int16") x = 0;
  @type("int16") y = 0;
  @type("uint8") rotation = 0;
}

export class HouseState extends Schema {
  @type("string") unitId = "";
  @type("string") label = "";
  @type("string") ownerId = "";
  @type("string") tenantId = "";
  @type("uint8") width = 10;
  @type("uint8") height = 8;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: FurnitureSchema }) furniture = new MapSchema<FurnitureSchema>();
}
