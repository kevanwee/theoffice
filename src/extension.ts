import * as vscode from 'vscode';

import {
  COMMAND_EXPORT_DEFAULT_LAYOUT,
  COMMAND_OPEN_CHARACTER_PICKER,
  COMMAND_SHOW_PANEL,
  COMMAND_SWITCH_SCENE,
  VIEW_ID,
} from './constants.js';
import { PixelAgentsViewProvider } from './PixelAgentsViewProvider.js';

let providerInstance: PixelAgentsViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  const provider = new PixelAgentsViewProvider(context);
  providerInstance = provider;

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider));

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_PANEL, () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_EXPORT_DEFAULT_LAYOUT, () => {
      provider.exportDefaultLayout();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_CHARACTER_PICKER, () => {
      // Focus the panel first, then send a message to open the picker for the active agent
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      provider.openCharacterPicker();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SWITCH_SCENE, async () => {
      provider.promptSwitchScene();
    }),
  );
}

export function deactivate() {
  providerInstance?.dispose();
}
