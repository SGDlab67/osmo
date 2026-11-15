export const registryAbi = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "name", type: "string" }], outputs: [] },
  { type: "function", name: "resolve", stateMutability: "view", inputs: [{ name: "name", type: "string" }], outputs: [{ type: "address" }] },
  { type: "function", name: "nameOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "string" }] },
] as const;

export const osmoAbi = [
  {
    type: "function",
    name: "sendToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "name", type: "string" },
      { name: "value", type: "uint256" },
      { name: "memo", type: "string" },
    ],
    outputs: [{ name: "to", type: "address" }],
  },
  {
    type: "function",
    name: "sendNative",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "memo", type: "string" },
    ],
    outputs: [{ name: "to", type: "address" }],
  },
  { type: "function", name: "sentBlockCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sentBlocks", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "uint64" }] },
  {
    type: "event",
    name: "Sent",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "value", type: "uint256", indexed: false },
      { name: "memo", type: "string", indexed: false },
      { name: "byAgent", type: "bool", indexed: false },
    ],
  },
] as const;

export const welcomeAbi = [
  {
    type: "function",
    name: "welcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "profile", type: "string" },
    ],
    outputs: [],
  },
  { type: "function", name: "setProfile", stateMutability: "nonpayable", inputs: [{ name: "profile", type: "string" }], outputs: [] },
  {
    type: "function",
    name: "grant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "welcomed", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "assetCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "assets", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "memberCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "members", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "profileOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "string" }] },
  { type: "function", name: "assetBySymbol", stateMutability: "view", inputs: [{ name: "", type: "string" }], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "request",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payer", type: "address" },
      { name: "usdCents", type: "uint64" },
      { name: "note", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "closeRequest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
    outputs: [],
  },
  { type: "function", name: "requestCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "requests",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "from", type: "address" },
      { name: "payer", type: "address" },
      { name: "usdCents", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "note", type: "string" },
    ],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
