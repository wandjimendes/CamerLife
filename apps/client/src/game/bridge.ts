import Phaser from "phaser";

/**
 * React -> Phaser event bus. (Phaser -> React goes through the zustand stores.)
 *
 * Events:
 *  - "interact"            player pressed E / tapped the prompt
 *  - "exit-house"          leave the current house interior
 *  - "exit-facility"       leave the current workplace
 *  - "remove-selected"     delete the selected furniture piece
 *  - "appearance-changed"  re-tint the local character after customization
 */
export const bridge = new Phaser.Events.EventEmitter();
