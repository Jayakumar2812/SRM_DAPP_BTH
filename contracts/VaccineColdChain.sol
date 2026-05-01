// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract VaccineColdChain is AccessControl {
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant TRANSPORTER_ROLE = keccak256("TRANSPORTER_ROLE");
    bytes32 public constant STORAGE_ROLE = keccak256("STORAGE_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant CLINIC_ROLE = keccak256("CLINIC_ROLE");
    bytes32 public constant IOT_ROLE = keccak256("IOT_ROLE");

    int16 public constant MIN_COLD_CHAIN_TEMP_C = 2;
    int16 public constant MAX_COLD_CHAIN_TEMP_C = 8;

    enum BatchStatus {
        Created,
        InTransit,
        InStorage,
        AtDistributor,
        AtLocalDepot,
        Delivered,
        Administered
    }

    enum Stage {
        Manufacturing,
        Transport,
        Storage,
        Distribution,
        LocalDepot,
        ClinicDelivery,
        Administered
    }

    struct Batch {
        bytes32 batchId;
        address manufacturer;
        address currentCustodian;
        uint256 createdAt;
        string metadataURI;
        BatchStatus status;
        bool exists;
        bool isCompromised;
    }

    struct ColdChainEvent {
        uint256 timestamp;
        int16 temperatureC;
        address submitter;
        address handler;
        Stage stage;
        string gpsLocation;
        string notes;
        bool inRange;
    }

    mapping(bytes32 batchId => Batch) private batches;
    mapping(bytes32 batchId => ColdChainEvent[]) private batchEvents;

    event BatchCreated(
        bytes32 indexed batchId,
        address indexed manufacturer,
        address indexed initialCustodian,
        string metadataURI
    );
    event ColdChainEventRecorded(
        bytes32 indexed batchId,
        Stage indexed stage,
        address indexed handler,
        int16 temperatureC,
        bool inRange
    );
    event BatchCompromised(bytes32 indexed batchId, int16 temperatureC, Stage indexed stage);
    event BatchDelivered(bytes32 indexed batchId, address indexed clinic);
    event BatchAdministered(bytes32 indexed batchId, address indexed clinic);

    error BatchAlreadyExists(bytes32 batchId);
    error BatchDoesNotExist(bytes32 batchId);
    error InvalidHandler(address handler);
    error InvalidStage(Stage stage);
    error UnauthorizedRecorder(address account, Stage stage);
    error BatchAlreadyAdministered(bytes32 batchId);

    constructor(address admin) {
        address initialAdmin = admin == address(0) ? msg.sender : admin;
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    function createBatch(
        bytes32 batchId,
        address initialCustodian,
        string calldata metadataURI,
        int16 temperatureC,
        string calldata gpsLocation,
        string calldata notes
    ) external onlyRole(MANUFACTURER_ROLE) {
        if (batches[batchId].exists) {
            revert BatchAlreadyExists(batchId);
        }

        address custodian = initialCustodian == address(0) ? msg.sender : initialCustodian;
        batches[batchId] = Batch({
            batchId: batchId,
            manufacturer: msg.sender,
            currentCustodian: custodian,
            createdAt: block.timestamp,
            metadataURI: metadataURI,
            status: BatchStatus.Created,
            exists: true,
            isCompromised: false
        });

        emit BatchCreated(batchId, msg.sender, custodian, metadataURI);
        _recordEvent(batchId, temperatureC, custodian, Stage.Manufacturing, gpsLocation, notes);
    }

    function recordHandoff(
        bytes32 batchId,
        int16 temperatureC,
        address handler,
        Stage stage,
        string calldata gpsLocation,
        string calldata notes
    ) external {
        _requireBatch(batchId);
        _requireStageRecorder(stage);
        _recordEvent(batchId, temperatureC, handler, stage, gpsLocation, notes);
    }

    function markAdministered(
        bytes32 batchId,
        int16 temperatureC,
        string calldata gpsLocation,
        string calldata notes
    ) external onlyRole(CLINIC_ROLE) {
        Batch storage batch = _requireBatch(batchId);
        if (batch.status == BatchStatus.Administered) {
            revert BatchAlreadyAdministered(batchId);
        }

        _recordEvent(batchId, temperatureC, msg.sender, Stage.Administered, gpsLocation, notes);
        emit BatchAdministered(batchId, msg.sender);
    }

    function getBatch(bytes32 batchId) external view returns (Batch memory) {
        return _requireExistingBatch(batchId);
    }

    function getBatchEvent(bytes32 batchId, uint256 index) external view returns (ColdChainEvent memory) {
        _requireExistingBatch(batchId);
        return batchEvents[batchId][index];
    }

    function getBatchEvents(bytes32 batchId) external view returns (ColdChainEvent[] memory) {
        _requireExistingBatch(batchId);
        return batchEvents[batchId];
    }

    function getEventCount(bytes32 batchId) external view returns (uint256) {
        _requireExistingBatch(batchId);
        return batchEvents[batchId].length;
    }

    function isSafeForUse(bytes32 batchId) external view returns (bool) {
        Batch memory batch = _requireExistingBatch(batchId);
        return !batch.isCompromised && batch.status != BatchStatus.Administered;
    }

    function _recordEvent(
        bytes32 batchId,
        int16 temperatureC,
        address handler,
        Stage stage,
        string calldata gpsLocation,
        string calldata notes
    ) private {
        if (handler == address(0)) {
            revert InvalidHandler(handler);
        }

        Batch storage batch = _requireBatch(batchId);
        bool inRange = temperatureC >= MIN_COLD_CHAIN_TEMP_C && temperatureC <= MAX_COLD_CHAIN_TEMP_C;

        if (!inRange && !batch.isCompromised) {
            batch.isCompromised = true;
            emit BatchCompromised(batchId, temperatureC, stage);
        }

        batch.currentCustodian = handler;
        batch.status = _statusForStage(stage);
        batchEvents[batchId].push(
            ColdChainEvent({
                timestamp: block.timestamp,
                temperatureC: temperatureC,
                submitter: msg.sender,
                handler: handler,
                stage: stage,
                gpsLocation: gpsLocation,
                notes: notes,
                inRange: inRange
            })
        );

        emit ColdChainEventRecorded(batchId, stage, handler, temperatureC, inRange);

        if (stage == Stage.ClinicDelivery) {
            emit BatchDelivered(batchId, handler);
        }
    }

    function _requireStageRecorder(Stage stage) private view {
        if (stage == Stage.Manufacturing || stage == Stage.Administered) {
            revert InvalidStage(stage);
        }

        bool authorized;
        if (hasRole(IOT_ROLE, msg.sender)) {
            authorized = true;
        } else if (stage == Stage.Transport || stage == Stage.ClinicDelivery) {
            authorized = hasRole(TRANSPORTER_ROLE, msg.sender) || hasRole(CLINIC_ROLE, msg.sender);
        } else if (stage == Stage.Storage || stage == Stage.LocalDepot) {
            authorized = hasRole(STORAGE_ROLE, msg.sender) || hasRole(DISTRIBUTOR_ROLE, msg.sender);
        } else if (stage == Stage.Distribution) {
            authorized = hasRole(DISTRIBUTOR_ROLE, msg.sender);
        }

        if (!authorized) {
            revert UnauthorizedRecorder(msg.sender, stage);
        }
    }

    function _statusForStage(Stage stage) private pure returns (BatchStatus) {
        if (stage == Stage.Manufacturing) {
            return BatchStatus.Created;
        }
        if (stage == Stage.Transport) {
            return BatchStatus.InTransit;
        }
        if (stage == Stage.Storage) {
            return BatchStatus.InStorage;
        }
        if (stage == Stage.Distribution) {
            return BatchStatus.AtDistributor;
        }
        if (stage == Stage.LocalDepot) {
            return BatchStatus.AtLocalDepot;
        }
        if (stage == Stage.ClinicDelivery) {
            return BatchStatus.Delivered;
        }
        if (stage == Stage.Administered) {
            return BatchStatus.Administered;
        }

        revert InvalidStage(stage);
    }

    function _requireBatch(bytes32 batchId) private view returns (Batch storage batch) {
        batch = batches[batchId];
        if (!batch.exists) {
            revert BatchDoesNotExist(batchId);
        }
    }

    function _requireExistingBatch(bytes32 batchId) private view returns (Batch storage batch) {
        return _requireBatch(batchId);
    }
}
