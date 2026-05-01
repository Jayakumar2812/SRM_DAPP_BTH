import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const privateKey = process.env.PRIVATE_KEY;
const monadRpcUrl = process.env.MONAD_RPC_URL ?? "";
const monadChainId = Number(process.env.MONAD_CHAIN_ID ?? "10143");
const etherscanApiKey = process.env.ETHERSCAN_API_KEY ?? "";
const isMonadMainnet = monadChainId === 143;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    monad: {
      url: monadRpcUrl,
      chainId: monadChainId,
      accounts: privateKey ? [privateKey] : []
    }
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify-api-monad.blockvision.org",
    browserUrl: "https://monadvision.com"
  },
  etherscan: {
    apiKey: etherscanApiKey,
    customChains: [
      {
        network: "monad",
        chainId: monadChainId,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: isMonadMainnet ? "https://monadscan.com" : "https://testnet.monadscan.com"
        }
      }
    ]
  }
};

export default config;
