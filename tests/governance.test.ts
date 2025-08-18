import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const voter1 = accounts.get('wallet_1')!;
const voter2 = accounts.get('wallet_2')!;
const researcher = accounts.get('wallet_3')!;

describe('Governance Contract Tests', () => {
  beforeEach(() => {
    // Setup governance tokens for voters
    simnet.callPublicFn(
      'treasury',
      'contribute-sbtc',
      [Cl.uint(100000000)], // 1 sBTC = 1000 governance tokens
      voter1
    );
    simnet.callPublicFn(
      'treasury',
      'contribute-sbtc',
      [Cl.uint(200000000)], // 2 sBTC = 2000 governance tokens
      voter2
    );
  });

  describe('Governance Proposal Creation', () => {
    it('should allow token holders to create governance proposals', () => {
      const { result } = simnet.callPublicFn(
        'governance',
        'create-governance-proposal',
        [
          Cl.stringAscii('Update Treasury Parameters'),
          Cl.stringAscii('Proposal to update minimum contribution amount'),
          Cl.stringAscii('parameter-update'),
          Cl.some(Cl.principal(`${deployer}.treasury`)),
          Cl.uint(144) // 1 day execution delay
        ],
        voter1
      );

      expect(result).toBeOk();
      expect(result.value).toBeUint(1);

      // Check proposal details
      const proposal = simnet.callReadOnlyFn(
        'governance',
        'get-proposal',
        [Cl.uint(1)],
        deployer
      );
      expect(proposal.result).toBeSome();
      const proposalData = proposal.result.value.data;
      expect(proposalData['proposer']).toBePrincipal(voter1);
      expect(proposalData['status']).toBeStringAscii('active');
    });

    it('should reject proposals from users without governance tokens', () => {
      const { result } = simnet.callPublicFn(
        'governance',
        'create-governance-proposal',
        [
          Cl.stringAscii('Invalid Proposal'),
          Cl.stringAscii('This should fail'),
          Cl.stringAscii('parameter-update'),
          Cl.none(),
          Cl.uint(144)
        ],
        accounts.get('wallet_4')! // No governance tokens
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR-INSUFFICIENT-VOTING-POWER
    });
  });

  describe('Research Proposal Submission', () => {
    it('should allow researchers to submit research proposals', () => {
      const methodologyHash = new Uint8Array(32).fill(1);
      
      const { result } = simnet.callPublicFn(
        'governance',
        'submit-research-proposal',
        [
          Cl.stringAscii('AI Safety Research'),
          Cl.stringAscii('Comprehensive study on AI alignment and safety measures'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.uint(300000000), // 3 sBTC
          Cl.uint(4) // 4 milestones
        ],
        researcher
      );

      expect(result).toBeOk();
      expect(result.value).toBeUint(1);

      // Check research proposal details
      const proposal = simnet.callReadOnlyFn(
        'governance',
        'get-research-proposal',
        [Cl.uint(1)],
        deployer
      );
      expect(proposal.result).toBeSome();
      const proposalData = proposal.result.value.data;
      expect(proposalData['researcher']).toBePrincipal(researcher);
      expect(proposalData['status']).toBeStringAscii('voting');
      expect(proposalData['total-budget']).toBeUint(300000000);
    });

    it('should reject research proposals with invalid parameters', () => {
      const methodologyHash = new Uint8Array(32).fill(1);
      
      // Test with zero budget
      const { result } = simnet.callPublicFn(
        'governance',
        'submit-research-proposal',
        [
          Cl.stringAscii('Invalid Research'),
          Cl.stringAscii('This should fail'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.uint(0), // Invalid budget
          Cl.uint(4)
        ],
        researcher
      );

      expect(result).toBeErr(Cl.uint(205)); // ERR-INVALID-PROPOSAL
    });
  });

  describe('Voting Mechanism', () => {
    let proposalId: number;

    beforeEach(() => {
      // Create a governance proposal to vote on
      const createResult = simnet.callPublicFn(
        'governance',
        'create-governance-proposal',
        [
          Cl.stringAscii('Test Proposal'),
          Cl.stringAscii('Test proposal for voting'),
          Cl.stringAscii('parameter-update'),
          Cl.none(),
          Cl.uint(144)
        ],
        voter1
      );
      proposalId = createResult.result.value;
    });

    it('should allow token holders to vote on proposals', () => {
      const { result } = simnet.callPublicFn(
        'governance',
        'vote-on-proposal',
        [Cl.uint(proposalId), Cl.bool(true)], // Vote in favor
        voter2
      );

      expect(result).toBeOk();
      const voteData = result.value.data;
      expect(voteData['proposal-id']).toBeUint(proposalId);
      expect(voteData['vote']).toBeBool(true);
      expect(voteData['voting-power']).toBeUint(2000); // voter2's tokens

      // Check vote was recorded
      const vote = simnet.callReadOnlyFn(
        'governance',
        'get-vote',
        [Cl.uint(proposalId), Cl.principal(voter2)],
        deployer
      );
      expect(vote.result).toBeSome();
    });

    it('should prevent duplicate voting', () => {
      // First vote
      simnet.callPublicFn(
        'governance',
        'vote-on-proposal',
        [Cl.uint(proposalId), Cl.bool(true)],
        voter1
      );

      // Attempt duplicate vote
      const { result } = simnet.callPublicFn(
        'governance',
        'vote-on-proposal',
        [Cl.uint(proposalId), Cl.bool(false)],
        voter1
      );

      expect(result).toBeErr(Cl.uint(203)); // ERR-DUPLICATE-VOTE
    });

    it('should reject votes from users without governance tokens', () => {
      const { result } = simnet.callPublicFn(
        'governance',
        'vote-on-proposal',
        [Cl.uint(proposalId), Cl.bool(true)],
        accounts.get('wallet_4')! // No governance tokens
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR-INSUFFICIENT-VOTING-POWER
    });

    it('should update proposal vote counts correctly', () => {
      // Vote in favor
      simnet.callPublicFn(
        'governance',
        'vote-on-proposal',
        [Cl.uint(proposalId), Cl.bool(true)],
        voter1
      );

      // Vote against
      simnet.callPublicFn(
        'governance',
        'vote-on-proposal',
        [Cl.uint(proposalId), Cl.bool(false)],
        voter2
      );

      // Check updated proposal
      const proposal = simnet.callReadOnlyFn(
        'governance',
        'get-proposal',
        [Cl.uint(proposalId)],
        deployer
      );
      const proposalData = proposal.result.value.data;
      expect(proposalData['votes-for']).toBeUint(1000); // voter1's tokens
      expect(proposalData['votes-against']).toBeUint(2000); // voter2's tokens
      expect(proposalData['total-votes']).toBeUint(3000);
    });
  });

  describe('Research Proposal Voting', () => {
    let researchProposalId: number;

    beforeEach(() => {
      // Create a research proposal
      const methodologyHash = new Uint8Array(32).fill(1);
      const createResult = simnet.callPublicFn(
        'governance',
        'submit-research-proposal',
        [
          Cl.stringAscii('Test Research'),
          Cl.stringAscii('Test research proposal'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.uint(200000000),
          Cl.uint(3)
        ],
        researcher
      );
      researchProposalId = createResult.result.value;
    });

    it('should allow voting on research proposals', () => {
      const { result } = simnet.callPublicFn(
        'governance',
        'vote-on-research-proposal',
        [Cl.uint(researchProposalId), Cl.bool(true)],
        voter1
      );

      expect(result).toBeOk();
      const voteData = result.value.data;
      expect(voteData['proposal-id']).toBeUint(researchProposalId);
      expect(voteData['vote']).toBeBool(true);
    });

    it('should finalize research proposals correctly', () => {
      // Cast votes
      simnet.callPublicFn(
        'governance',
        'vote-on-research-proposal',
        [Cl.uint(researchProposalId), Cl.bool(true)],
        voter1
      );
      simnet.callPublicFn(
        'governance',
        'vote-on-research-proposal',
        [Cl.uint(researchProposalId), Cl.bool(true)],
        voter2
      );

      // Advance blocks past voting period
      simnet.mineEmptyBlocks(1441);

      // Finalize proposal
      const { result } = simnet.callPublicFn(
        'governance',
        'finalize-research-proposal',
        [Cl.uint(researchProposalId)],
        deployer
      );

      expect(result).toBeOk();
      const finalizeData = result.value.data;
      expect(finalizeData['status']).toBeStringAscii('approved');
      expect(finalizeData['votes-for']).toBeUint(3000); // Both voters
    });
  });

  describe('Voting Period Management', () => {
    it('should check if voting is active correctly', () => {
      // Create proposal
      const createResult = simnet.callPublicFn(
        'governance',
        'create-governance-proposal',
        [
          Cl.stringAscii('Time Test'),
          Cl.stringAscii('Testing voting period'),
          Cl.stringAscii('parameter-update'),
          Cl.none(),
          Cl.uint(144)
        ],
        voter1
      );
      const proposalId = createResult.result.value;

      // Check voting is active
      const isActive = simnet.callReadOnlyFn(
        'governance',
        'is-voting-active',
        [Cl.uint(proposalId)],
        deployer
      );
      expect(isActive.result).toBeBool(true);

      // Advance past voting period
      simnet.mineEmptyBlocks(1441);

      // Check voting is no longer active
      const isActiveAfter = simnet.callReadOnlyFn(
        'governance',
        'is-voting-active',
        [Cl.uint(proposalId)],
        deployer
      );
      expect(isActiveAfter.result).toBeBool(false);
    });

    it('should reject votes after voting period ends', () => {
      // Create proposal
      const createResult = simnet.callPublicFn(
        'governance',
        'create-governance-proposal',
        [
          Cl.stringAscii('Expired Vote Test'),
          Cl.stringAscii('Testing expired voting'),
          Cl.stringAscii('parameter-update'),
          Cl.none(),
          Cl.uint(144)
        ],
        voter1
      );
      const proposalId = createResult.result.value;

      // Advance past voting period
      simnet.mineEmptyBlocks(1441);

      // Try to vote after period ends
      const { result } = simnet.callPublicFn(
        'governance',
        'vote-on-proposal',
        [Cl.uint(proposalId), Cl.bool(true)],
        voter2
      );

      expect(result).toBeErr(Cl.uint(202)); // ERR-VOTING-CLOSED
    });
  });

  describe('Admin Functions', () => {
    it('should allow contract owner to pause governance', () => {
      const { result } = simnet.callPublicFn(
        'governance',
        'pause-governance',
        [],
        deployer
      );

      expect(result).toBeOk();
      expect(result.value).toBeBool(true);
    });

    it('should reject governance pause from non-owner', () => {
      const { result } = simnet.callPublicFn(
        'governance',
        'pause-governance',
        [],
        voter1
      );

      expect(result).toBeErr(Cl.uint(204)); // ERR-UNAUTHORIZED
    });

    it('should prevent proposal creation when paused', () => {
      // Pause governance
      simnet.callPublicFn('governance', 'pause-governance', [], deployer);

      // Try to create proposal while paused
      const { result } = simnet.callPublicFn(
        'governance',
        'create-governance-proposal',
        [
          Cl.stringAscii('Paused Test'),
          Cl.stringAscii('Should fail'),
          Cl.stringAscii('parameter-update'),
          Cl.none(),
          Cl.uint(144)
        ],
        voter1
      );

      expect(result).toBeErr(Cl.uint(204)); // ERR-UNAUTHORIZED
    });
  });
});