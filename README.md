# Vaccine Cold Chain DApp

A full-stack DApp for tracking vaccine batches through a role-based cold chain. The contract records temperature, handler, timestamp, GPS, and notes at every handoff, then permanently flags a batch as compromised if any reading falls outside 2-8°C.

## Stack

- Solidity + Hardhat for contracts and tests
- OpenZeppelin AccessControl for roles
- Monad-compatible deployment configuration
- Next.js frontend in `frontend/`

## Contract Roles

- `DEFAULT_ADMIN_ROLE`: grants and revokes all roles
- `MANUFACTURER_ROLE`: creates vaccine batches
- `TRANSPORTER_ROLE`: records transport and clinic-delivery handoffs
- `STORAGE_ROLE`: records warehouse and local depot custody
- `DISTRIBUTOR_ROLE`: records distribution hub and local depot custody
- `CLINIC_ROLE`: records final clinic delivery and administration
- `IOT_ROLE`: trusted device/oracle address that can submit operational telemetry

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with your Monad RPC URL, chain ID, private key, and deployed contract address.
The Next.js app loads the public frontend values from this same root `.env`.

## Contract Commands

```bash
npm run compile
npm test
npm run deploy:monad
npx hardhat verify --network monad <contract_address> <admin_constructor_arg>
```

## Frontend Commands

```bash
npm run frontend:dev
npm run frontend:lint
npm run frontend:build
```

The frontend expects:

- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_MONAD_RPC_URL`
- `NEXT_PUBLIC_MONAD_CHAIN_ID`

## Workflow

1. Admin grants roles to manufacturers, transporters, storage operators, distributors, clinics, and optional IoT submitters.
2. Manufacturer creates a vaccine batch.
3. Authorized handlers record each custody event with temperature and GPS metadata.
4. The contract marks the batch compromised forever if any temperature is outside 2-8°C.
5. Clinic verifies the batch and marks it administered after delivery.
