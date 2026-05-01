export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0x9f250bd99d1d2cA839a14ADD3fD5013A6036f26d";
export const MONAD_CHAIN_ID = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? "143");
export const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://rpc.monad.xyz";

export const STAGES = [
  "Manufacturing",
  "Transport",
  "Storage",
  "Distribution",
  "LocalDepot",
  "ClinicDelivery",
  "Administered"
] as const;

export const STATUSES = [
  "Created",
  "In Transit",
  "In Storage",
  "At Distributor",
  "At Local Depot",
  "Delivered",
  "Administered"
] as const;

export const ROLE_KEYS = [
  "MANUFACTURER_ROLE",
  "TRANSPORTER_ROLE",
  "STORAGE_ROLE",
  "DISTRIBUTOR_ROLE",
  "CLINIC_ROLE",
  "IOT_ROLE"
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const VACCINE_COLD_CHAIN_ABI = [
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function MANUFACTURER_ROLE() view returns (bytes32)",
  "function TRANSPORTER_ROLE() view returns (bytes32)",
  "function STORAGE_ROLE() view returns (bytes32)",
  "function DISTRIBUTOR_ROLE() view returns (bytes32)",
  "function CLINIC_ROLE() view returns (bytes32)",
  "function IOT_ROLE() view returns (bytes32)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function createBatch(bytes32 batchId, address initialCustodian, string metadataURI, int16 temperatureC, string gpsLocation, string notes)",
  "function recordHandoff(bytes32 batchId, int16 temperatureC, address handler, uint8 stage, string gpsLocation, string notes)",
  "function markAdministered(bytes32 batchId, int16 temperatureC, string gpsLocation, string notes)",
  "function getBatch(bytes32 batchId) view returns (tuple(bytes32 batchId, address manufacturer, address currentCustodian, uint256 createdAt, string metadataURI, uint8 status, bool exists, bool isCompromised))",
  "function getBatchEvents(bytes32 batchId) view returns (tuple(uint256 timestamp, int16 temperatureC, address submitter, address handler, uint8 stage, string gpsLocation, string notes, bool inRange)[])",
  "function isSafeForUse(bytes32 batchId) view returns (bool)",
  "event BatchCreated(bytes32 indexed batchId, address indexed manufacturer, address indexed initialCustodian, string metadataURI)",
  "event ColdChainEventRecorded(bytes32 indexed batchId, uint8 indexed stage, address indexed handler, int16 temperatureC, bool inRange)",
  "event BatchCompromised(bytes32 indexed batchId, int16 temperatureC, uint8 indexed stage)",
  "event BatchDelivered(bytes32 indexed batchId, address indexed clinic)",
  "event BatchAdministered(bytes32 indexed batchId, address indexed clinic)"
] as const;
