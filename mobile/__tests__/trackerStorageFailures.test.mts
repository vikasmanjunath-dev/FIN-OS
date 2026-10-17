import { test } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTrackerData, saveTracker } from '@/lib/trackerStorage';
import { loadTransactions, addTransaction } from '@/lib/txnStorage';
import { canRenderLoadedTrackerData, getTrackerStorageStatus, clearTrackerStorageStatus, reportTrackerSaveFailure, setTrackerStorageStatus } from '@/lib/trackerStorageStatus';

test('tracker load failure is surfaced instead of becoming an empty account', async () => {
  const original = AsyncStorage.multiGet;
  AsyncStorage.multiGet = async () => { throw new Error('synthetic storage failure'); };
  try {
    await loadTrackerData();
    assert.equal(getTrackerStorageStatus()?.kind, 'load');
    assert.equal(canRenderLoadedTrackerData(getTrackerStorageStatus()), false);
  } finally {
    AsyncStorage.multiGet = original;
    clearTrackerStorageStatus();
  }
});

test('tracker save failure is surfaced and cannot return an unsaved success value', async () => {
  const original = AsyncStorage.multiSet;
  AsyncStorage.multiSet = async () => { throw new Error('synthetic storage failure'); };
  try {
    await assert.rejects(saveTracker({ income: 50000 }), /Could not save tracker data/);
    assert.equal(getTrackerStorageStatus()?.kind, 'save');
  } finally {
    AsyncStorage.multiSet = original;
    clearTrackerStorageStatus();
  }
});

test('a save failure cannot replace a load failure and reveal fallback tracker values', () => {
  setTrackerStorageStatus({ kind: 'load', message: 'Could not load saved data.' });
  reportTrackerSaveFailure('Could not save tracker data.');
  assert.equal(getTrackerStorageStatus()?.kind, 'load');
  assert.equal(canRenderLoadedTrackerData(getTrackerStorageStatus()), false);
  clearTrackerStorageStatus();
});

test('transaction read failure cannot be shown as an empty ledger', async () => {
  const original = AsyncStorage.getItem;
  AsyncStorage.getItem = async () => { throw new Error('synthetic storage failure'); };
  try {
    assert.deepEqual(await loadTransactions(), []);
    assert.equal(getTrackerStorageStatus()?.kind, 'load');
    assert.equal(canRenderLoadedTrackerData(getTrackerStorageStatus()), false);
  } finally {
    AsyncStorage.getItem = original;
    clearTrackerStorageStatus();
  }
});

test('transaction write failure rejects and reports that the ledger was not saved', async () => {
  const originalGet = AsyncStorage.getItem;
  const originalSet = AsyncStorage.setItem;
  AsyncStorage.getItem = async () => null;
  AsyncStorage.setItem = async () => { throw new Error('synthetic storage failure'); };
  try {
    await assert.rejects(addTransaction({ date: '2026-10-17', amount: 100, kind: 'expense', category: 'Food', label: 'Lunch' }), /Could not save transactions/);
    assert.equal(getTrackerStorageStatus()?.kind, 'save');
  } finally {
    AsyncStorage.getItem = originalGet;
    AsyncStorage.setItem = originalSet;
    clearTrackerStorageStatus();
  }
});
