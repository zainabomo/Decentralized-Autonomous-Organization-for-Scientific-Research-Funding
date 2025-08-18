# Research Funding DAO

A decentralized autonomous organization (DAO) that democratizes scientific research funding by enabling a global community to pool capital and collectively vote on research proposals using the Stacks blockchain.

## Overview

The Research Funding DAO addresses limitations of centralized funding agencies by creating a transparent, community-driven platform where:

- **Contributors** provide sBTC to the treasury and receive governance tokens
- **Researchers** submit detailed proposals for innovative scientific projects  
- **DAO Members** vote on proposals using their governance tokens
- **Funded researchers** receive milestone-based funding with built-in accountability

## Key Features

### 🏛️ Decentralized Governance
- Proportional voting power based on sBTC contributions
- Community-driven funding decisions
- Protocol governance for DAO parameter updates

### 🔬 Research Proposal System
- Detailed proposal submissions with methodology and budgets
- Milestone-based project structure
- Public review and voting process

### 💰 Milestone-Based Funding
- Tranche releases tied to milestone completion
- Automated verification and fund distribution
- Community oversight for project accountability

### 🔒 Security & Transparency
- Multi-signature treasury protection
- Immutable blockchain record keeping
- Audited smart contracts
- Emergency pause mechanisms

## Technology Stack

- **Blockchain**: Stacks
- **Smart Contracts**: Clarity
- **Funding Token**: sBTC
- **Testing**: Vitest with Clarinet SDK
- **Development**: Clarinet framework


## Getting Started

### Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) - Stacks smart contract development tool
- [Node.js](https://nodejs.org/) (v16 or higher)
- [Git](https://git-scm.com/)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd research-funding-dao
```

2. Install dependencies:
```bash
npm install
```

3. Verify Clarinet installation:
```bash
clarinet --version
```

### Development

#### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage and cost analysis
npm run test:report

# Watch mode for continuous testing
npm run test:watch
```

#### Smart Contract Development
```bash
# Check contract syntax
clarinet check

# Start local development environment
clarinet integrate

# Deploy to testnet
clarinet deploy --testnet
```

## Core Workflows

### For Contributors
1. Connect wallet to DAO interface
2. Contribute sBTC to treasury
3. Receive governance tokens proportionally
4. Participate in proposal voting

### For Researchers
1. Prepare detailed research proposal
2. Submit proposal with milestones and budget
3. Community review and voting period
4. If approved, receive initial funding tranche
5. Complete milestones to unlock additional funding

### For DAO Members
1. Review submitted research proposals
2. Vote using governance tokens
3. Monitor funded project progress
4. Participate in protocol governance decisions

## Smart Contract Architecture

The DAO consists of several interconnected smart contracts:

- **Treasury Contract**: Manages sBTC deposits and governance token minting
- **Governance Contract**: Handles proposal voting and parameter updates
- **Proposal Contract**: Manages research proposal lifecycle
- **Milestone Contract**: Tracks project progress and funding releases
- **Security Contract**: Implements multi-sig and emergency controls

## Development Status

🚧 **Project Status**: Early Development

- ✅ Requirements specification complete
- ⏳ Smart contract implementation in progress
- ⏳ Testing framework setup
- ⏳ Frontend interface development
- ⏳ Security audit planning

## Contributing

We welcome contributions from developers, researchers, and community members!

### Development Process
1. Clone the repository and install dependencies
2. Check existing issues and project board
3. Fork the repository and create a feature branch
4. Implement changes with comprehensive tests
5. Submit a pull request with detailed description

### Code Standards
- Follow Clarity best practices for smart contracts
- Maintain 100% test coverage for critical functions
- Include comprehensive documentation
- Security-first development approach

## Security Considerations

This project handles financial assets and requires the highest security standards:

- All smart contracts will undergo professional security audits
- Multi-signature controls for treasury management
- Time-locked mechanisms for large fund movements
- Emergency pause functionality for critical vulnerabilities
- Formal verification of core contract logic

## Roadmap

### Phase 1: Core Infrastructure
- [ ] Implement treasury and governance token contracts
- [ ] Build proposal submission and voting system
- [ ] Create milestone tracking mechanism
- [ ] Comprehensive testing suite

### Phase 2: Security & Auditing
- [ ] Professional security audit
- [ ] Bug bounty program
- [ ] Multi-signature implementation
- [ ] Emergency response procedures

### Phase 3: Community Launch
- [ ] Testnet deployment and testing
- [ ] Community governance setup
- [ ] Mainnet deployment
- [ ] Initial funding round

### Phase 4: Advanced Features
- [ ] Research outcome tracking
- [ ] Reputation system for researchers
- [ ] Cross-chain funding mechanisms
- [ ] AI-assisted proposal evaluation



## Support

- **Documentation**: Check the `.kiro/specs/` directory for detailed requirements
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Community**: Join our Discord/Telegram for discussions
- **Security**: Report vulnerabilities privately to security@researchdao.org

## Disclaimer

This software is experimental and under active development. Do not use with real funds until security audits are complete and the system has been thoroughly tested.