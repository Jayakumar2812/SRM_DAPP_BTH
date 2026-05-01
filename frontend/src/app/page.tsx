"use client";

import { BrowserProvider, Contract, ethers } from "ethers";
import { FormEvent, useMemo, useState } from "react";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
  ROLE_KEYS,
  RoleKey,
  STAGES,
  STATUSES,
  VACCINE_COLD_CHAIN_ABI
} from "@/lib/contract";

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

type BatchView = {
  batchId: string;
  manufacturer: string;
  currentCustodian: string;
  createdAt: bigint;
  metadataURI: string;
  status: number;
  exists: boolean;
  isCompromised: boolean;
};

type EventView = {
  timestamp: bigint;
  temperatureC: bigint;
  submitter: string;
  handler: string;
  stage: number;
  gpsLocation: string;
  notes: string;
  inRange: boolean;
};

const emptyAddress = "0x0000000000000000000000000000000000000000";

function shortAddress(address: string) {
  if (!address || address.length < 10) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function monadNetworkName() {
  return MONAD_CHAIN_ID === 143 ? "Monad Mainnet" : `Monad Chain ${MONAD_CHAIN_ID}`;
}

function toBytes32BatchId(batchId: string) {
  return batchId.startsWith("0x") && batchId.length === 66 ? batchId : ethers.id(batchId.trim());
}

export default function Home() {
  const [account, setAccount] = useState("");
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [message, setMessage] = useState("Connect a wallet to begin.");
  const [isBusy, setIsBusy] = useState(false);
  const [roleAccount, setRoleAccount] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleKey>("MANUFACTURER_ROLE");
  const [batchId, setBatchId] = useState("VX4492");
  const [metadataURI, setMetadataURI] = useState("ipfs://vaccine-lot-vx4492");
  const [initialCustodian, setInitialCustodian] = useState("");
  const [temperature, setTemperature] = useState("4");
  const [gpsLocation, setGpsLocation] = useState("Mumbai manufacturing site");
  const [notes, setNotes] = useState("QA certified batch tagged");
  const [handoffBatchId, setHandoffBatchId] = useState("VX4492");
  const [handler, setHandler] = useState("");
  const [handoffTemperature, setHandoffTemperature] = useState("4");
  const [stage, setStage] = useState("1");
  const [handoffGps, setHandoffGps] = useState("Route B GPS locked");
  const [handoffNotes, setHandoffNotes] = useState("Refrigerated vehicle dispatch");
  const [lookupBatchId, setLookupBatchId] = useState("VX4492");
  const [batch, setBatch] = useState<BatchView | null>(null);
  const [events, setEvents] = useState<EventView[]>([]);
  const [safeForUse, setSafeForUse] = useState<boolean | null>(null);

  const contractAddressConfigured = useMemo(() => ethers.isAddress(CONTRACT_ADDRESS), []);

  async function getContract(withSigner = true) {
    if (!window.ethereum) {
      throw new Error("No wallet found. Install MetaMask or another EVM wallet.");
    }
    if (!contractAddressConfigured) {
      throw new Error("Set NEXT_PUBLIC_CONTRACT_ADDRESS after deploying the contract.");
    }

    const provider = new BrowserProvider(window.ethereum);
    if (!withSigner) {
      return new Contract(CONTRACT_ADDRESS, VACCINE_COLD_CHAIN_ABI, provider);
    }

    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, VACCINE_COLD_CHAIN_ABI, signer);
  }

  async function runTransaction(action: () => Promise<ethers.ContractTransactionResponse>, success: string) {
    setIsBusy(true);
    setMessage("Submitting transaction...");
    try {
      const tx = await action();
      setMessage(`Waiting for confirmation: ${tx.hash}`);
      await tx.wait();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transaction failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function connectWallet() {
    setIsBusy(true);
    try {
      if (!window.ethereum) {
        throw new Error("No wallet found. Install MetaMask or another EVM wallet.");
      }

      const provider = new BrowserProvider(window.ethereum);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      const network = await provider.getNetwork();
      setAccount(accounts[0]);
      setConnectedAccounts(accounts);

      if (Number(network.chainId) !== MONAD_CHAIN_ID) {
        setMessage(`Connected ${accounts[0]}. Switch your wallet to ${monadNetworkName()}.`);
      } else {
        setMessage(`Wallet connected on ${monadNetworkName()}: ${accounts[0]}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function switchToMonad() {
    if (!window.ethereum) {
      setMessage("No wallet found.");
      return;
    }

    const chainIdHex = `0x${MONAD_CHAIN_ID.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }]
      });
      setMessage("Switched to Monad.");
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: monadNetworkName(),
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: [MONAD_RPC_URL]
          }
        ]
      });
      setMessage(`Added ${monadNetworkName()} to wallet.`);
    }
  }

  async function grantSelectedRole() {
    await runTransaction(async () => {
      const contract = await getContract();
      const role = await contract[selectedRole]();
      return contract.grantRole(role, roleAccount);
    }, `${selectedRole} granted to ${roleAccount}.`);
  }

  async function revokeSelectedRole() {
    await runTransaction(async () => {
      const contract = await getContract();
      const role = await contract[selectedRole]();
      return contract.revokeRole(role, roleAccount);
    }, `${selectedRole} revoked from ${roleAccount}.`);
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runTransaction(async () => {
      const contract = await getContract();
      const custodian = initialCustodian || account || emptyAddress;
      return contract.createBatch(
        toBytes32BatchId(batchId),
        custodian,
        metadataURI,
        Number(temperature),
        gpsLocation,
        notes
      );
    }, `Batch ${batchId} created.`);
  }

  async function recordHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runTransaction(async () => {
      const contract = await getContract();
      return contract.recordHandoff(
        toBytes32BatchId(handoffBatchId),
        Number(handoffTemperature),
        handler || account,
        Number(stage),
        handoffGps,
        handoffNotes
      );
    }, `Handoff recorded for ${handoffBatchId}.`);
  }

  async function markAdministered() {
    await runTransaction(async () => {
      const contract = await getContract();
      return contract.markAdministered(
        toBytes32BatchId(handoffBatchId),
        Number(handoffTemperature),
        handoffGps,
        "Administered safely at clinic"
      );
    }, `${handoffBatchId} marked as administered.`);
  }

  async function loadBatch() {
    setIsBusy(true);
    setMessage("Loading batch...");
    try {
      const contract = await getContract(false);
      const bytesBatchId = toBytes32BatchId(lookupBatchId);
      const [batchResult, eventResults, safe] = await Promise.all([
        contract.getBatch(bytesBatchId),
        contract.getBatchEvents(bytesBatchId),
        contract.isSafeForUse(bytesBatchId)
      ]);

      setBatch(batchResult as BatchView);
      setEvents([...eventResults] as EventView[]);
      setSafeForUse(Boolean(safe));
      setMessage(`Loaded ${lookupBatchId}.`);
    } catch (error) {
      setBatch(null);
      setEvents([]);
      setSafeForUse(null);
      setMessage(error instanceof Error ? error.message : "Unable to load batch.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-8 shadow-2xl shadow-cyan-950">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">Monad DApp</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
                Vaccine Cold Chain Tracking
              </h1>
              <p className="mt-4 max-w-3xl text-lg text-slate-300">
                Record every vaccine batch handoff with timestamped temperature, GPS, and handler metadata.
                Any reading outside 2-8°C permanently flags the batch as compromised.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
              <p className="text-sm text-slate-400">Wallet</p>
              <p className="mt-2 break-all font-mono text-sm">{account || "Not connected"}</p>
              {connectedAccounts.length > 1 ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">All exposed accounts</p>
                  <div className="mt-2 space-y-2">
                    {connectedAccounts.map((connectedAccount) => (
                      <p className="break-all font-mono text-xs text-slate-300" key={connectedAccount}>
                        {connectedAccount}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="mt-2 text-sm text-slate-400">Target network: {monadNetworkName()}</p>
              <p className="mt-2 text-sm text-slate-400">
                Contract: {contractAddressConfigured ? shortAddress(CONTRACT_ADDRESS) : "not configured"}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="btn-primary" disabled={isBusy} onClick={connectWallet}>
                  Connect Wallet
                </button>
                <button className="btn-secondary" disabled={isBusy} onClick={switchToMonad}>
                  Switch {monadNetworkName()}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">
          {message}
        </div>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="card">
            <h2 className="card-title">Admin Role Dashboard</h2>
            <label className="label">Role</label>
            <select className="input" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as RoleKey)}>
              {ROLE_KEYS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <label className="label">Account</label>
            <input
              className="input"
              placeholder="0x..."
              value={roleAccount}
              onChange={(event) => setRoleAccount(event.target.value)}
            />
            <div className="mt-4 flex gap-3">
              <button className="btn-primary" disabled={isBusy || !roleAccount} onClick={grantSelectedRole}>
                Grant
              </button>
              <button className="btn-secondary" disabled={isBusy || !roleAccount} onClick={revokeSelectedRole}>
                Revoke
              </button>
            </div>
          </div>

          <form className="card" onSubmit={createBatch}>
            <h2 className="card-title">Create Vaccine Batch</h2>
            <label className="label">Batch ID</label>
            <input className="input" value={batchId} onChange={(event) => setBatchId(event.target.value)} />
            <label className="label">Metadata URI</label>
            <input className="input" value={metadataURI} onChange={(event) => setMetadataURI(event.target.value)} />
            <label className="label">Initial Custodian</label>
            <input
              className="input"
              placeholder="defaults to connected wallet"
              value={initialCustodian}
              onChange={(event) => setInitialCustodian(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Temp °C</label>
                <input className="input" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
              </div>
              <div>
                <label className="label">GPS</label>
                <input className="input" value={gpsLocation} onChange={(event) => setGpsLocation(event.target.value)} />
              </div>
            </div>
            <label className="label">Notes</label>
            <textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
            <button className="btn-primary mt-4 w-full" disabled={isBusy}>
              Create Batch
            </button>
          </form>

          <form className="card" onSubmit={recordHandoff}>
            <h2 className="card-title">Record Handoff / Telemetry</h2>
            <label className="label">Batch ID</label>
            <input className="input" value={handoffBatchId} onChange={(event) => setHandoffBatchId(event.target.value)} />
            <label className="label">Stage</label>
            <select className="input" value={stage} onChange={(event) => setStage(event.target.value)}>
              {STAGES.slice(1, 6).map((stageName, index) => (
                <option key={stageName} value={index + 1}>
                  {stageName}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Temp °C</label>
                <input
                  className="input"
                  value={handoffTemperature}
                  onChange={(event) => setHandoffTemperature(event.target.value)}
                />
              </div>
              <div>
                <label className="label">Handler</label>
                <input
                  className="input"
                  placeholder="defaults to wallet"
                  value={handler}
                  onChange={(event) => setHandler(event.target.value)}
                />
              </div>
            </div>
            <label className="label">GPS</label>
            <input className="input" value={handoffGps} onChange={(event) => setHandoffGps(event.target.value)} />
            <label className="label">Notes</label>
            <textarea
              className="input min-h-20"
              value={handoffNotes}
              onChange={(event) => setHandoffNotes(event.target.value)}
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="btn-primary" disabled={isBusy}>
                Record Handoff
              </button>
              <button className="btn-secondary" disabled={isBusy} onClick={markAdministered} type="button">
                Mark Administered
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="card-title">Verify Batch Timeline</h2>
              <p className="text-sm text-slate-400">Hospitals and patients can verify status before administration.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input className="input" value={lookupBatchId} onChange={(event) => setLookupBatchId(event.target.value)} />
              <button className="btn-primary" disabled={isBusy} onClick={loadBatch}>
                Load Batch
              </button>
            </div>
          </div>

          {batch ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-[0.35fr_0.65fr]">
              <div className="rounded-2xl border border-white/10 bg-slate-950 p-5">
                <p className="text-sm text-slate-400">Current Status</p>
                <p className="mt-2 text-2xl font-bold">{STATUSES[Number(batch.status)]}</p>
                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <p>Manufacturer: {shortAddress(batch.manufacturer)}</p>
                  <p>Custodian: {shortAddress(batch.currentCustodian)}</p>
                  <p>Metadata: {batch.metadataURI}</p>
                  <p>Safe for use: {safeForUse ? "Yes" : "No"}</p>
                  <p className={batch.isCompromised ? "text-red-300" : "text-emerald-300"}>
                    {batch.isCompromised ? "Compromised by temperature excursion" : "Cold chain intact"}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {events.map((event, index) => (
                  <div
                    className="rounded-2xl border border-white/10 bg-slate-950 p-5"
                    key={`${event.timestamp.toString()}-${index}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold">{STAGES[Number(event.stage)]}</p>
                      <span className={event.inRange ? "badge-safe" : "badge-risk"}>
                        {event.temperatureC.toString()}°C {event.inRange ? "in range" : "out of range"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-2">
                      <p>Handler: {shortAddress(event.handler)}</p>
                      <p>Submitter: {shortAddress(event.submitter)}</p>
                      <p>GPS: {event.gpsLocation}</p>
                      <p>{new Date(Number(event.timestamp) * 1000).toLocaleString()}</p>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{event.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-6 rounded-2xl border border-dashed border-white/10 p-6 text-slate-400">
              Load a batch ID, such as `VX4492`, after creating it on-chain.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
