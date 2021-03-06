// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import uuid = require('uuid');
import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { AzureAccount } from '../../src/azure-account.api';
import { TruffleCommands } from '../../src/commands/TruffleCommands';
import { ConsortiumResourceExplorer } from '../../src/ConsortiumResourceExplorer';
import { Constants } from '../../src/Constants';
import { GanacheService } from '../../src/GanacheService/GanacheService';
import * as helpers from '../../src/helpers';
import { TruffleConfiguration } from '../../src/helpers';
import * as commands from '../../src/helpers/command';
import * as workspace from '../../src/helpers/workspace';
import { MnemonicRepository } from '../../src/MnemonicService/MnemonicRepository';
import {
  AzureConsortium,
  CancellationEvent,
  IExtensionItem,
  ItemType,
  LocalNetworkConsortium,
  MainNetworkConsortium,
  Network,
  TestNetworkConsortium,
  } from '../../src/Models';
import { ConsortiumTreeManager } from '../../src/treeService/ConsortiumTreeManager';
import { TestConstants } from '../TestConstants';

describe('TruffleCommands', () => {
  describe('Integration test', async () => {
    describe('deployContracts', () => {
      let requiredMock: sinon.SinonMock;
      let checkAppsSilent: sinon.SinonExpectation;
      let installTruffle: sinon.SinonExpectation;
      let isHdWalletProviderRequired: sinon.SinonExpectation;
      let checkHdWalletProviderVersion: sinon.SinonExpectation;
      let installTruffleHdWalletProvider: sinon.SinonExpectation;

      let getWorkspaceRootMock: any;

      let windowMock: sinon.SinonMock;
      let showQuickPickMock: any;
      let showInputBoxMock: any;
      let showSaveDialogMock: sinon.SinonExpectation;

      let ganacheServiceMock: sinon.SinonMock;
      let startGanacheServer: sinon.SinonExpectation;

      let getItemsMock: sinon.SinonStub<[(boolean | undefined)?], IExtensionItem[]>;
      let loadStateMock: sinon.SinonStub<[], IExtensionItem[]>;
      let testConsortiumItems: Network[];

      let truffleConfigSetNetworkMock: any;
      let truffleConfigGetNetworkMock: any;
      let truffleConfigGenerateMnemonicMock: any;
      let consortiumTreeManager: ConsortiumTreeManager;

      let commandContextMock: sinon.SinonMock;
      let executeCommandMock: sinon.SinonExpectation;

      let mnemonicRepositoryMock: sinon.SinonMock;
      let getMnemonicMock: sinon.SinonStub<any[], any>;
      let getAllMnemonicPathsMock: sinon.SinonStub<any[], any>;
      let saveMnemonicPathMock: sinon.SinonExpectation;

      let writeFileSyncMock: any;

      let getAccessKeysMock: any;

      let getExtensionMock: any;

      beforeEach(async () => {
        getWorkspaceRootMock = sinon.stub(workspace, 'getWorkspaceRoot');

        requiredMock = sinon.mock(helpers.required);
        checkAppsSilent = requiredMock.expects('checkAppsSilent');
        installTruffle = requiredMock.expects('installTruffle');
        isHdWalletProviderRequired = requiredMock.expects('isHdWalletProviderRequired');
        checkHdWalletProviderVersion = requiredMock.expects('checkHdWalletProviderVersion');
        installTruffleHdWalletProvider = requiredMock.expects('installTruffleHdWalletProvider');
        isHdWalletProviderRequired.returns(false);
        checkHdWalletProviderVersion.returns(false);

        windowMock = sinon.mock(vscode.window);
        showQuickPickMock = sinon.stub(vscode.window, 'showQuickPick');
        showInputBoxMock = sinon.stub(vscode.window, 'showInputBox');
        showSaveDialogMock = windowMock.expects('showSaveDialog');

        ganacheServiceMock = sinon.mock(GanacheService);
        startGanacheServer = ganacheServiceMock.expects('startGanacheServer');

        getItemsMock = sinon.stub(ConsortiumTreeManager.prototype, 'getItems');
        loadStateMock = sinon.stub(ConsortiumTreeManager.prototype, 'loadState');
        testConsortiumItems = await createTestConsortiumItems();
        getItemsMock.returns(testConsortiumItems);
        loadStateMock.returns(testConsortiumItems);

        truffleConfigSetNetworkMock = sinon.stub(TruffleConfiguration.TruffleConfig.prototype, 'setNetworks');
        truffleConfigGetNetworkMock = sinon.stub(TruffleConfiguration.TruffleConfig.prototype, 'getNetworks');
        truffleConfigGetNetworkMock.returns(getTestTruffleNetworks());
        truffleConfigGenerateMnemonicMock = sinon.stub(TruffleConfiguration, 'generateMnemonic');
        truffleConfigGenerateMnemonicMock.returns(TestConstants.testMnemonic);

        consortiumTreeManager = new ConsortiumTreeManager({} as ExtensionContext);

        commandContextMock = sinon.mock(commands);
        executeCommandMock = commandContextMock.expects('executeCommand');

        mnemonicRepositoryMock = sinon.mock(MnemonicRepository);
        getMnemonicMock = mnemonicRepositoryMock.expects('getMnemonic').returns(TestConstants.testMnemonic);
        getAllMnemonicPathsMock = mnemonicRepositoryMock.expects('getAllMnemonicPaths').returns([] as string []);
        saveMnemonicPathMock = mnemonicRepositoryMock.expects('saveMnemonicPath');

        writeFileSyncMock = sinon.stub(fs, 'writeFileSync');

        getAccessKeysMock = sinon.stub(ConsortiumResourceExplorer.prototype, 'getAccessKeys');

        getExtensionMock = sinon.stub(vscode.extensions, 'getExtension').returns(mockExtension);
      });

      afterEach(() => {
        sinon.restore();
      });

      it('should throw exception when config file not found', async () => {
        // Arrange
        getWorkspaceRootMock.returns(__dirname);
        executeCommandMock.returns(uuid.v4());

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager),
          Error,
          Constants.errorMessageStrings.TruffleConfigIsNotExist);
      });

      it('should throw cancellationEvent when showQuickPick return undefined', async () => {
        // Arrange
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());
        showQuickPickMock.returns(undefined);

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager), CancellationEvent);
      });

      it('should install TruffleHdWalletProvider when it required', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        isHdWalletProviderRequired.returns(true);
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.development);
        });

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, true, 'startGanacheServer should be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          true,
          'checkHdWalletProviderVersion should be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          true,
          'installTruffleHdWalletProvider should be called');
      });

      it('should not install TruffleHdWalletProvider when it version correct', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        isHdWalletProviderRequired.returns(true);
        checkHdWalletProviderVersion.returns(true);
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.development);
        });

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, true, 'startGanacheServer should be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          true,
          'checkHdWalletProviderVersion should be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to development should complete successfully', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.development);
        });

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, true, 'startGanacheServer should be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to development should throw exception when there is an error on command execution', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.throws(TestConstants.testError);

        showQuickPickMock.callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.development);
        });

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager), Error);

        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, true, 'startGanacheServer should be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to mainNetwork should throw cancellationEvent when showInputBox return undefined', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        showInputBoxMock.returns(undefined);
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testMainNetwork);
        });

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager), CancellationEvent);
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, false, 'executeCommand should not be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to mainNetwork should throw cancellationEvent when showInputBox return not "yes"', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        showInputBoxMock.returns(uuid.v4());
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testMainNetwork);
        });

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager), CancellationEvent);
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, false, 'executeCommand should not be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to mainNetwork should complete successfully', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        showInputBoxMock.returns(Constants.confirmationDialogResult.yes);
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testMainNetwork);
        });

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.calledOnce, true, 'showInputBox should be called once');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to mainNetwork should throw exception when there is an error on command execution', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        showInputBoxMock.returns(Constants.confirmationDialogResult.yes);
        executeCommandMock.throws(TestConstants.testError);

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testMainNetwork);
        });

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager));
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.calledOnce, true, 'showInputBox should be called once');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to network should complete successfully', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testNetwork);
        });

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to network should throw exception when there is an error on command execution', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.throws(TestConstants.testError);

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testNetwork);
        });

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager));
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, false, 'truffleConfig.setNetwork should not be called');
        assert.strictEqual(isHdWalletProviderRequired.calledOnce, true, 'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to local consortium should complete successfully', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.local);
        });

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, true, 'startGanacheServer should be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to local consortium should throw exception when there is an error on command execution', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.throws(TestConstants.testError);

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.local);
        });

        // Act and assert
        await assert.rejects(TruffleCommands.deployContracts(consortiumTreeManager));
        assert.strictEqual(showQuickPickMock.calledOnce, true, 'showQuickPick should be called once');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, true, 'startGanacheServer should be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumNetwork should generate mnemonic and complete successfully', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.publicEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.generateMnemonic);
        });

        showInputBoxMock.onCall(0).returns(Constants.confirmationDialogResult.yes);
        showInputBoxMock.onCall(1).returns(100000000000);
        showInputBoxMock.onCall(2).returns(4712388);

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 3, 'showInputBox should be called tree times');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumNetwork should generate mnemonic and complete successfully with default params', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.publicEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.generateMnemonic);
        });

        showInputBoxMock.onCall(0).returns(Constants.confirmationDialogResult.yes);
        showInputBoxMock.onCall(1).returns('');
        showInputBoxMock.onCall(2).returns('');

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 3, 'showInputBox should be called tree times');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumNetwork should complete successfully when user paste mnemonic', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.publicEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.pasteMnemonic);
        });

        showInputBoxMock.onCall(0).returns(Constants.confirmationDialogResult.yes);
        showInputBoxMock.onCall(1).returns(TestConstants.testMnemonic);
        showInputBoxMock.onCall(2).returns(100000000000);
        showInputBoxMock.onCall(3).returns(4712388);

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 4, 'showInputBox should be called four times');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumNetwork should complete successfully with default params when user paste mnemonic', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.publicEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.pasteMnemonic);
        });

        showInputBoxMock.onCall(0).returns(Constants.confirmationDialogResult.yes);
        showInputBoxMock.onCall(1).returns(TestConstants.testMnemonic);
        showInputBoxMock.onCall(2).returns('');
        showInputBoxMock.onCall(3).returns('');

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 4, 'showInputBox should be called four times');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumTestnet should generate mnemonic and complete successfully', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.testEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.generateMnemonic);
        });

        showInputBoxMock.onCall(0).returns(100000000000);
        showInputBoxMock.onCall(1).returns(4712388);

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 2, 'showInputBox should be called twice');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumTestnet should generate mnemonic and complete successfully with default params', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.testEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.generateMnemonic);
        });

        showInputBoxMock.onCall(0).returns('');
        showInputBoxMock.onCall(1).returns('');

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 2, 'showInputBox should be called twice');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumTestnet should complete successfully when user paste mnemonic', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.testEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.pasteMnemonic);
        });

        showInputBoxMock.onCall(0).returns(TestConstants.testMnemonic);
        showInputBoxMock.onCall(1).returns(100000000000);
        showInputBoxMock.onCall(2).returns(4712388);

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 3, 'showInputBox should be called tree times');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to EthereumTestnet should complete successfully with default params when user paste mnemonic', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.consortiumTestNames.testEthereum);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.pasteMnemonic);
        });

        showInputBoxMock.onCall(0).returns(TestConstants.testMnemonic);
        showInputBoxMock.onCall(1).returns('');
        showInputBoxMock.onCall(2).returns('');

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(showInputBoxMock.called, true, 'showInputBox should be called');
        assert.strictEqual(showInputBoxMock.callCount, 3, 'showInputBox should be called tree times');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to AzureBlockchainService should generate mnemonic and complete successfully', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());
        getAccessKeysMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testConsortium);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.generateMnemonic);
        });

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(getAccessKeysMock.called, true, 'getAccessKeys should be called');
        assert.strictEqual(showInputBoxMock.called, false, 'showInputBox should not be called');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(getExtensionMock.called, true, 'getExtension should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });

      it('to AzureBlockchainService should complete successfully when user paste mnemonic', async () => {
        // Arrange
        checkAppsSilent.returns(true);
        getWorkspaceRootMock.returns(path.join(__dirname, TestConstants.truffleCommandTestDataFolder));
        executeCommandMock.returns(uuid.v4());
        getAccessKeysMock.returns(uuid.v4());

        showQuickPickMock.onCall(0).callsFake((items: any) => {
          return items.find((item: any) => item.label === TestConstants.networksNames.testConsortium);
        });

        showQuickPickMock.onCall(1).callsFake((items: any) => {
          return items.find((item: any) => item.label === Constants.placeholders.pasteMnemonic);
        });

        showInputBoxMock.onCall(0).returns(TestConstants.testMnemonic);

        showSaveDialogMock.returns(uuid.v4());

        // Act
        await TruffleCommands.deployContracts(consortiumTreeManager);

        // Assert
        assert.strictEqual(showQuickPickMock.called, true, 'showQuickPick should be called');
        assert.strictEqual(showQuickPickMock.callCount, 2, 'showQuickPick should be called twice');
        assert.strictEqual(getAccessKeysMock.called, true, 'getAccessKeys should be called');
        assert.strictEqual(showInputBoxMock.calledOnce, true, 'showInputBox should be called once');
        assert.strictEqual(getMnemonicMock.called, false, 'getMnemonic should not be called');
        assert.strictEqual(getAllMnemonicPathsMock.called, true, 'getAllMnemonicPaths should be called');
        assert.strictEqual(saveMnemonicPathMock.called, true, 'saveMnemonicPath should be called');
        assert.strictEqual(writeFileSyncMock.called, true, 'writeFileSync should be called');
        assert.strictEqual(checkAppsSilent.calledOnce, true, 'checkAppsSilent should be called once');
        assert.strictEqual(installTruffle.called, false, 'installTruffle should not be called');
        assert.strictEqual(getWorkspaceRootMock.called, true, 'getWorkspaceRoot should be called');
        assert.strictEqual(executeCommandMock.called, true, 'executeCommand should be called');
        assert.strictEqual(startGanacheServer.called, false, 'startGanacheServer should not be called');
        assert.strictEqual(truffleConfigSetNetworkMock.called, true, 'truffleConfig.setNetwork should be called');
        assert.strictEqual(getExtensionMock.called, true, 'getExtension should be called');
        assert.strictEqual(
          isHdWalletProviderRequired.calledOnce,
          true,
          'isHdWalletProviderRequired should be called');
        assert.strictEqual(
          checkHdWalletProviderVersion.calledOnce,
          false,
          'checkHdWalletProviderVersion should not be called');
        assert.strictEqual(
          installTruffleHdWalletProvider.calledOnce,
          false,
          'installTruffleHdWalletProvider should not be called');
      });
    });
  });
});

async function createTestConsortiumItems(): Promise<Network[]> {
  const networks: Network[] = [];

  const azureNetwork = new Network(TestConstants.networksNames.azureBlockchainService, ItemType.AZURE_BLOCKCHAIN);
  const localNetwork = new Network(TestConstants.networksNames.localNetwork, ItemType.LOCAL_NETWORK);
  const ethereumTestnet = new Network(TestConstants.networksNames.ethereumTestnet, ItemType.ETHEREUM_TEST_NETWORK);
  const ethereumNetwork = new Network(TestConstants.networksNames.ethereumNetwork, ItemType.ETHEREUM_MAIN_NETWORK);

  const azureConsortium = new AzureConsortium(
    TestConstants.networksNames.testConsortium,
    uuid.v4(),
    uuid.v4(),
    uuid.v4(),
    'https://testConsortium.blockchain.azure.com/',
  );
  const localNetworkConsortium = new LocalNetworkConsortium(
    TestConstants.consortiumTestNames.local,
    'http://127.0.0.1:8545/',
  );
  const testNetworkConsortium = new TestNetworkConsortium(
    TestConstants.consortiumTestNames.testEthereum,
    'https://0.0.0.3:1234/',
  );
  const mainNetworkConsortium = new MainNetworkConsortium(
    TestConstants.consortiumTestNames.publicEthereum,
    'https://0.0.0.4:1234/',
  );

  azureConsortium.setConsortiumId(randomInteger());
  localNetworkConsortium.setConsortiumId(randomInteger());
  testNetworkConsortium.setConsortiumId(randomInteger());
  mainNetworkConsortium.setConsortiumId(randomInteger());

  azureNetwork.addChild(azureConsortium);
  localNetwork.addChild(localNetworkConsortium);
  ethereumTestnet.addChild(testNetworkConsortium);
  ethereumNetwork.addChild(mainNetworkConsortium);

  networks.push(azureNetwork, localNetwork, ethereumNetwork, ethereumTestnet);

  return networks;
}

function getTestTruffleNetworks(): TruffleConfiguration.INetwork[] {
  const networks: TruffleConfiguration.INetwork[] = [];

  networks.push({
    name: TestConstants.networksNames.development,
    options: {
      host: '127.0.0.1',
      network_id: '*',
      port: 8545,
    },
  },
  {
    name: TestConstants.networksNames.testMainNetwork,
    options: {
      consortium_id: 1559217403180,
      gas: 4712388,
      gasPrice: 100000000000,
      network_id: 1,
    },
  },
  {
    name: TestConstants.networksNames.testNetwork,
    options: {
      consortium_id: 1559217403181,
      gas: 4712388,
      gasPrice: 100000000000,
      network_id: 2,
    },
  });

  return networks;
}

function randomInteger(): number {
  const max = + Date.now();
  const rand = - 0.5 + Math.random() * (max + 1);
  return Math.round(rand);
}

async function waitAMoment() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 100);
  });
}

async function mockActivate() {
  await waitAMoment();
  return {} as AzureAccount;
}

const mockExtension: vscode.Extension<AzureAccount> = {
  activate: mockActivate,
  exports: {} as AzureAccount,
  extensionPath: uuid.v4(),
  id: uuid.v4(),
  isActive: true,
  packageJSON: uuid.v4(),
};
