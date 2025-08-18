import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const contributor1 = accounts.get('wallet_1')!;
const contributor2 = accounts.get('wallet_2')!;
const researcher = accounts.get('wallet_3')!;

describe('Treasury Contract Tests', () => {
  beforeEach(() => {
    // Reset simnet state before each test
  });

  describe('sBTC Contributions', () => {
    it('should allow valid sBTC contributions and mint governance tokens', () => {
      const contributionAmount = 100000000; // 1 sBTC in satoshis
      
      const { result } = simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(contributionAmount)],
        contributor1
      );

      expect(result).toBeOk();
      
      const contributionData = result.value.data;
      expect(contributionData['tokens-received']).toBeUint(1000); // 1000 governance tokens
      expect(contributionData['new-balance']).toBeUint(1000);
      
      // Check treasury balance
      const treasuryBalance = simnet.callReadOnlyFn(
        'treasury',
        'get-treasury-balance',
        [],
        deployer
      );
      expect(treasuryBalance.result).toBeUint(contributionAmount);
    });

    it('should reject contributions below minimum threshold', () => {
      const smallAmount = 500000; // 0.005 sBTC (below minimum)
      
      const { result } = simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(smallAmount)],
        contributor1
      );

      expect(result).toBeErr(Cl.uint(102)); // ERR-INVALID-AMOUNT
    });

    it('should correctly calculate governance tokens for different amounts', () => {
      const testAmounts = [100000000, 200000000, 500000000]; // 1, 2, 5 sBTC
      const expectedTokens = [1000, 2000, 5000];

      testAmounts.forEach((amount, index) => {
        const calculation = simnet.callReadOnlyFn(
          'treasury',
          'calculate-governance-tokens',
          [Cl.uint(amount)],
          deployer
        );
        expect(calculation.result).toBeUint(expectedTokens[index]);
      });
    });

    it('should track multiple contributions from same user', () => {
      // First contribution
      simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(100000000)],
        contributor1
      );

      // Second contribution
      const { result } = simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(200000000)],
        contributor1
      );

      expect(result).toBeOk();
      const contributionData = result.value.data;
      expect(contributionData['new-balance']).toBeUint(3000); // 1000 + 2000 tokens
    });
  });

  describe('Governance Token Management', () => {
    beforeEach(() => {
      // Setup initial contributions
      simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(100000000)],
        contributor1
      );
      simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(200000000)],
        contributor2
      );
    });

    it('should allow governance token transfers', () => {
      const transferAmount = 500;
      
      const { result } = simnet.callPublicFn(
        'treasury',
        'transfer-governance-tokens',
        [Cl.principal(contributor2), Cl.uint(transferAmount)],
        contributor1
      );

      expect(result).toBeOk();
      
      // Check balances after transfer
      const sender_balance = simnet.callReadOnlyFn(
        'treasury',
        'get-governance-token-balance',
        [Cl.principal(contributor1)],
        deployer
      );
      expect(sender_balance.result).toBeUint(500); // 1000 - 500

      const recipient_balance = simnet.callReadOnlyFn(
        'treasury',
        'get-governance-token-balance',
        [Cl.principal(contributor2)],
        deployer
      );
      expect(recipient_balance.result).toBeUint(2500); // 2000 + 500
    });

    it('should reject transfers exceeding balance', () => {
      const excessiveAmount = 2000; // More than contributor1's 1000 tokens
      
      const { result } = simnet.callPublicFn(
        'treasury',
        'transfer-governance-tokens',
        [Cl.principal(contributor2), Cl.uint(excessiveAmount)],
        contributor1
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR-INSUFFICIENT-FUNDS
    });
  });

  describe('Proposal Funding', () => {
    beforeEach(() => {
      // Setup treasury with funds
      simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(500000000)], // 5 sBTC
        contributor1
      );
    });

    it('should allow contract owner to approve proposals', () => {
      const proposalId = 1;
      const budget = 100000000; // 1 sBTC
      
      const { result } = simnet.callPublicFn(
        'treasury',
        'approve-proposal',
        [Cl.uint(proposalId), Cl.principal(researcher), Cl.uint(budget)],
        deployer
      );

      expect(result).toBeOk();
      expect(result.value).toBeUint(proposalId);
      
      // Check approved proposal data
      const proposalData = simnet.callReadOnlyFn(
        'treasury',
        'get-approved-proposal',
        [Cl.uint(proposalId)],
        deployer
      );
      expect(proposalData.result).toBeSome();
    });

    it('should reject proposal approval exceeding treasury balance', () => {
      const proposalId = 1;
      const excessiveBudget = 1000000000; // 10 sBTC (more than 5 sBTC in treasury)
      
      const { result } = simnet.callPublicFn(
        'treasury',
        'approve-proposal',
        [Cl.uint(proposalId), Cl.principal(researcher), Cl.uint(excessiveBudget)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR-INSUFFICIENT-FUNDS
    });

    it('should allow funding release for approved proposals', () => {
      const proposalId = 1;
      const budget = 200000000; // 2 sBTC
      const releaseAmount = 50000000; // 0.5 sBTC
      
      // First approve the proposal
      simnet.callPublicFn(
        'treasury',
        'approve-proposal',
        [Cl.uint(proposalId), Cl.principal(researcher), Cl.uint(budget)],
        deployer
      );

      // Then release funding
      const { result } = simnet.callPublicFn(
        'treasury',
        'release-funding',
        [Cl.uint(proposalId), Cl.uint(releaseAmount)],
        deployer
      );

      expect(result).toBeOk();
      
      const releaseData = result.value.data;
      expect(releaseData['amount-released']).toBeUint(releaseAmount);
      expect(releaseData['total-released']).toBeUint(releaseAmount);
      expect(releaseData['remaining-budget']).toBeUint(budget - releaseAmount);
    });

    it('should reject funding release exceeding approved budget', () => {
      const proposalId = 1;
      const budget = 100000000; // 1 sBTC
      const excessiveRelease = 150000000; // 1.5 sBTC
      
      // Approve proposal
      simnet.callPublicFn(
        'treasury',
        'approve-proposal',
        [Cl.uint(proposalId), Cl.principal(researcher), Cl.uint(budget)],
        deployer
      );

      // Try to release more than approved
      const { result } = simnet.callPublicFn(
        'treasury',
        'release-funding',
        [Cl.uint(proposalId), Cl.uint(excessiveRelease)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(102)); // ERR-INVALID-AMOUNT
    });
  });

  describe('Access Control', () => {
    it('should only allow contract owner to approve proposals', () => {
      const { result } = simnet.callPublicFn(
        'treasury',
        'approve-proposal',
        [Cl.uint(1), Cl.principal(researcher), Cl.uint(100000000)],
        contributor1 // Not the contract owner
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR-UNAUTHORIZED
    });

    it('should only allow contract owner to release funding', () => {
      const { result } = simnet.callPublicFn(
        'treasury',
        'release-funding',
        [Cl.uint(1), Cl.uint(50000000)],
        contributor1 // Not the contract owner
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR-UNAUTHORIZED
    });

    it('should only allow contract owner to use emergency functions', () => {
      const pauseResult = simnet.callPublicFn(
        'treasury',
        'emergency-pause',
        [],
        contributor1 // Not the contract owner
      );

      expect(pauseResult.result).toBeErr(Cl.uint(101)); // ERR-UNAUTHORIZED
    });
  });

  describe('Contribution History', () => {
    it('should track contribution history correctly', () => {
      const contributionAmount = 100000000;
      
      simnet.callPublicFn(
        'treasury',
        'contribute-sbtc',
        [Cl.uint(contributionAmount)],
        contributor1
      );

      const history = simnet.callReadOnlyFn(
        'treasury',
        'get-contribution-history',
        [Cl.uint(1)],
        deployer
      );

      expect(history.result).toBeSome();
      const historyData = history.result.value.data;
      expect(historyData['contributor']).toBePrincipal(contributor1);
      expect(historyData['amount']).toBeUint(contributionAmount);
      expect(historyData['tokens-received']).toBeUint(1000);
    });
  });
});