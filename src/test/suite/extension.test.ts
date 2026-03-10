import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'kevanwee.theoffice';

suite('The Office — Extension Tests', () => {
  test('Extension is present', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `Extension "${EXTENSION_ID}" should be installed in the test host`);
  });

  test('Extension activates without errors', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true, 'Extension should be active after activate()');
  });

  suite('Registered commands', () => {
    let commands: string[];

    suiteSetup(async () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      await ext?.activate();
      commands = await vscode.commands.getCommands(true);
    });

    test('theoffice.showPanel is registered', () => {
      assert.ok(commands.includes('theoffice.showPanel'));
    });

    test('theoffice.exportDefaultLayout is registered', () => {
      assert.ok(commands.includes('theoffice.exportDefaultLayout'));
    });

    test('theoffice.openCharacterPicker is registered', () => {
      assert.ok(commands.includes('theoffice.openCharacterPicker'));
    });

    test('theoffice.switchScene is registered', () => {
      assert.ok(commands.includes('theoffice.switchScene'));
    });
  });

  suite('Extension configuration', () => {
    test('Default backend setting defaults to "claude"', () => {
      const config = vscode.workspace.getConfiguration('theoffice');
      assert.strictEqual(config.get<string>('defaultBackend'), 'claude');
    });

    test('Active theme defaults to "pokemon"', () => {
      const config = vscode.workspace.getConfiguration('theoffice');
      assert.strictEqual(config.get<string>('activeTheme'), 'pokemon');
    });

    test('Sound enabled defaults to true', () => {
      const config = vscode.workspace.getConfiguration('theoffice');
      assert.strictEqual(config.get<boolean>('soundEnabled'), true);
    });
  });
});
