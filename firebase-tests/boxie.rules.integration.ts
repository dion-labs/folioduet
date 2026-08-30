import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const projectId = "demo-dionlabs-boxie";
let environment: RulesTestEnvironment;

function rootData(epoch = 1, activeVaultId = "vault_1234567890123456") {
  return {
    schemaVersion: 1,
    activeVaultId,
    epoch,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function vaultData(epoch = 1) {
  return {
    schemaVersion: 1,
    epoch,
    keyVersion: 1,
    status: "active",
    createdAt: serverTimestamp()
  };
}

function objectData(epoch = 1) {
  return {
    schemaVersion: 1,
    epoch,
    algorithm: "AES-256-GCM",
    contentType: "application/vnd.boxie.synthetic+json",
    nonce: "AAECAwQFBgcICQoL",
    ciphertext: "opaque-ciphertext-with-auth-tag",
    wrappedKeyNonce: "CwwNDg8QERITFBUW",
    wrappedKey: "opaque-wrapped-data-key",
    createdAt: serverTimestamp()
  };
}

function deviceData(epoch = 1, vaultId = "vault_1234567890123456") {
  return {
    schemaVersion: 1,
    vaultId,
    epoch,
    name: "Test browser",
    publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp()
  };
}

describe("shared Dion Labs Firestore rules: Boxie", () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
      }
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it("allows the owner to create and read a bounded encrypted vault object", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "boxie", "alice"), rootData()));
    await assertSucceeds(setDoc(
      doc(alice, "boxie", "alice", "vaults", "vault_1234567890123456"),
      vaultData()
    ));
    const object = doc(
      alice,
      "boxie",
      "alice",
      "vaults",
      "vault_1234567890123456",
      "objects",
      "synthetic_1"
    );
    await assertSucceeds(setDoc(object, objectData()));
    await assertSucceeds(getDoc(object));
  });

  it("allows atomic first-device creation using the post-transaction root epoch", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(runTransaction(alice, async (transaction) => {
      transaction.set(doc(alice, "boxie", "alice"), rootData());
      transaction.set(
        doc(alice, "boxie", "alice", "vaults", "vault_1234567890123456"),
        vaultData()
      );
      transaction.set(
        doc(alice, "boxie", "alice", "devices", "device_first"),
        deviceData()
      );
    }));
  });

  it("denies another user and an unauthenticated client", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob").firestore();
    const guest = environment.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(alice, "boxie", "alice"), rootData()));

    await assertFails(getDoc(doc(bob, "boxie", "alice")));
    await assertFails(setDoc(
      doc(bob, "boxie", "alice", "vaults", "vault_1234567890123456"),
      vaultData()
    ));
    await assertFails(getDoc(doc(guest, "boxie", "alice")));
  });

  it("denies unknown Boxie subcollections and malformed plaintext-shaped data", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "boxie", "alice"), rootData()));
    await assertFails(setDoc(
      doc(alice, "boxie", "alice", "unknown", "document"),
      { plaintext: "not allowed" }
    ));
    await assertFails(setDoc(
      doc(
        alice,
        "boxie",
        "alice",
        "vaults",
        "vault_1234567890123456",
        "objects",
        "plaintext"
      ),
      { ...objectData(), subject: "This field is forbidden" }
    ));
  });

  it("rejects a stale device object after the root epoch advances", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const root = doc(alice, "boxie", "alice");
    await assertSucceeds(setDoc(root, rootData()));
    await assertSucceeds(updateDoc(root, {
      activeVaultId: "vault_abcdefghijklmnop",
      epoch: 2,
      updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(
      doc(
        alice,
        "boxie",
        "alice",
        "vaults",
        "vault_1234567890123456",
        "objects",
        "stale"
      ),
      objectData(1)
    ));
    await assertSucceeds(setDoc(
      doc(alice, "boxie", "alice", "vaults", "vault_abcdefghijklmnop"),
      vaultData(2)
    ));
    await assertSucceeds(setDoc(
      doc(
        alice,
        "boxie",
        "alice",
        "vaults",
        "vault_abcdefghijklmnop",
        "objects",
        "current"
      ),
      objectData(2)
    ));
  });

  it("accepts a short-lived pairing and one immutable approval transition", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "boxie", "alice"), rootData()));
    const pairing = doc(alice, "boxie", "alice", "pairings", "pair_1");
    await assertSucceeds(setDoc(pairing, {
      schemaVersion: 1,
      vaultId: "vault_1234567890123456",
      epoch: 1,
      requestingDeviceId: "device_new",
      requestingDeviceName: "New browser",
      requestingPublicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      safetyCode: "ABCD-1234",
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60_000),
      status: "pending",
      createdAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(pairing, {
      status: "approved",
      approvingDeviceId: "device_existing",
      senderPublicKeyJwk: { kty: "EC", crv: "P-256", x: "x2", y: "y2" },
      salt: "opaque-salt",
      nonce: "opaque-nonce",
      ciphertext: "opaque-wrapped-vault-key",
      approvedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(pairing, { requestingDeviceName: "Substituted" }));
  });

  it("preserves FolioDuet owner and public-catalog behavior", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob").firestore();
    const guest = environment.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(alice, "pageecho", "alice"), { theme: "dark" }));
    await assertFails(getDoc(doc(bob, "pageecho", "alice")));
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "pageecho", "catalog", "samples", "sample"), {
        title: "Shared sample"
      });
    });
    await assertSucceeds(getDoc(doc(guest, "pageecho", "catalog", "samples", "sample")));
  });
});
