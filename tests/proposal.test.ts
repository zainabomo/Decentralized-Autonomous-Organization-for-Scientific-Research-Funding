import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const researcher1 = accounts.get('wallet_1')!;
const researcher2 = accounts.get('wallet_2')!;
const reviewer1 = accounts.get('wallet_3')!;
const reviewer2 = accounts.get('wallet_4')!;

describe('Proposal Contract Tests', () => {
  beforeEach(() => {
    // Setup governance tokens for reviewers
    simnet.callPublicFn('treasury', 'contribute-sbtc', [Cl.uint(100000000)], reviewer1);
    simnet.callPublicFn('treasury', 'contribute-sbtc', [Cl.uint(100000000)], reviewer2);
  });

  describe('Researcher Registration', () => {
    it('should allow researchers to register', () => {
      const credentialsHash = new Uint8Array(32).fill(1);

      const { result } = simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );

      expect(result).toBeOk();
      expect(result.value).toBePrincipal(researcher1);

      // Check researcher profile
      const profile = simnet.callReadOnlyFn(
        'proposal',
        'get-researcher-profile',
        [Cl.principal(researcher1)],
        deployer
      );
      expect(profile.result).toBeSome();
      const profileData = profile.result.value.data;
      expect(profileData['name']).toBeStringAscii('Dr. Alice Smith');
      expect(profileData['institution']).toBeStringAscii('MIT');
      expect(profileData['verification-status']).toBeStringAscii('pending');
      expect(profileData['reputation-score']).toBeUint(50);
    });

    it('should reject duplicate registrations', () => {
      const credentialsHash = new Uint8Array(32).fill(1);

      // First registration
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );

      // Attempt duplicate registration
      const { result } = simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith Updated'),
          Cl.stringAscii('Harvard'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );

      expect(result).toBeErr(Cl.uint(403)); // ERR-PROPOSAL-ALREADY-EXISTS
    });
  });

  describe('Researcher Verification', () => {
    beforeEach(() => {
      // Register researcher
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );
    });

    it('should allow contract owner to verify researchers', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'verify-researcher',
        [Cl.principal(researcher1)],
        deployer
      );

      expect(result).toBeOk();
      expect(result.value).toBePrincipal(researcher1);

      // Check verification status updated
      const profile = simnet.callReadOnlyFn(
        'proposal',
        'get-researcher-profile',
        [Cl.principal(researcher1)],
        deployer
      );
      const profileData = profile.result.value.data;
      expect(profileData['verification-status']).toBeStringAscii('verified');
    });

    it('should reject verification from non-owner', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'verify-researcher',
        [Cl.principal(researcher1)],
        researcher2 // Not the contract owner
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it('should check if researcher is verified', () => {
      // Before verification
      const isVerifiedBefore = simnet.callReadOnlyFn(
        'proposal',
        'is-verified-researcher',
        [Cl.principal(researcher1)],
        deployer
      );
      expect(isVerifiedBefore.result).toBeBool(false);

      // Verify researcher
      simnet.callPublicFn('proposal', 'verify-researcher', [Cl.principal(researcher1)], deployer);

      // After verification
      const isVerifiedAfter = simnet.callReadOnlyFn(
        'proposal',
        'is-verified-researcher',
        [Cl.principal(researcher1)],
        deployer
      );
      expect(isVerifiedAfter.result).toBeBool(true);
    });
  });

  describe('Proposal Submission', () => {
    beforeEach(() => {
      // Register and verify researcher
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );
      simnet.callPublicFn('proposal', 'verify-researcher', [Cl.principal(researcher1)], deployer);
    });

    it('should allow verified researchers to submit proposals', () => {
      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);

      const { result } = simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('AI Safety Research'),
          Cl.stringAscii('Comprehensive study on AI alignment and safety measures for next-gen systems'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(300000000), // 3 sBTC
          Cl.uint(4), // 4 milestones
          Cl.uint(8064), // ~8 weeks duration
          Cl.stringAscii('Artificial Intelligence'),
          Cl.some(Cl.stringAscii('QmXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx'))
        ],
        researcher1
      );

      expect(result).toBeOk();
      const submissionData = result.value.data;
      expect(submissionData['proposal-id']).toBeUint(1);
      expect(submissionData['status']).toBeStringAscii('submitted');

      // Check proposal details
      const proposal = simnet.callReadOnlyFn(
        'proposal',
        'get-proposal',
        [Cl.uint(1)],
        deployer
      );
      expect(proposal.result).toBeSome();
      const proposalData = proposal.result.value.data;
      expect(proposalData['researcher']).toBePrincipal(researcher1);
      expect(proposalData['title']).toBeStringAscii('AI Safety Research');
      expect(proposalData['total-budget']).toBeUint(300000000);
      expect(proposalData['status']).toBeStringAscii('submitted');
    });

    it('should reject proposals from unverified researchers', () => {
      // Register but don't verify researcher2
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Bob Jones'),
          Cl.stringAscii('Stanford'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher2
      );

      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);

      const { result } = simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('Invalid Research'),
          Cl.stringAscii('This should fail'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(200000000),
          Cl.uint(3),
          Cl.uint(6048),
          Cl.stringAscii('Computer Science'),
          Cl.none()
        ],
        researcher2
      );

      expect(result).toBeErr(Cl.uint(404)); // ERR-INVALID-RESEARCHER
    });

    it('should reject proposals with invalid budget amounts', () => {
      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);

      // Test with budget too low
      const { result } = simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('Low Budget Research'),
          Cl.stringAscii('Budget too low'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(50000000), // 0.5 sBTC - below minimum
          Cl.uint(2),
          Cl.uint(4032),
          Cl.stringAscii('Test'),
          Cl.none()
        ],
        researcher1
      );

      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-PROPOSAL
    });

    it('should update researcher proposal count', () => {
      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);

      // Submit proposal
      simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('Test Research'),
          Cl.stringAscii('Test proposal'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(200000000),
          Cl.uint(3),
          Cl.uint(6048),
          Cl.stringAscii('Test'),
          Cl.none()
        ],
        researcher1
      );

      // Check updated profile
      const profile = simnet.callReadOnlyFn(
        'proposal',
        'get-researcher-profile',
        [Cl.principal(researcher1)],
        deployer
      );
      const profileData = profile.result.value.data;
      expect(profileData['total-proposals']).toBeUint(1);
    });
  });

  describe('Milestone Management', () => {
    let proposalId: number;

    beforeEach(() => {
      // Setup verified researcher and proposal
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );
      simnet.callPublicFn('proposal', 'verify-researcher', [Cl.principal(researcher1)], deployer);

      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);
      const submitResult = simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('Test Research'),
          Cl.stringAscii('Test proposal'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(400000000),
          Cl.uint(4),
          Cl.uint(8064),
          Cl.stringAscii('Test'),
          Cl.none()
        ],
        researcher1
      );
      proposalId = submitResult.result.value.data['proposal-id'];
    });

    it('should allow researchers to add milestone details', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'add-proposal-milestone',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.stringAscii('Research Phase 1'),
          Cl.stringAscii('Initial literature review and methodology development'),
          Cl.uint(25), // 25% of budget
          Cl.uint(simnet.blockHeight + 2016),
          Cl.stringAscii('Literature review document, methodology paper'),
          Cl.stringAscii('Comprehensive review completed, methodology validated')
        ],
        researcher1
      );

      expect(result).toBeOk();
      const milestoneData = result.value.data;
      expect(milestoneData['proposal-id']).toBeUint(proposalId);
      expect(milestoneData['milestone-id']).toBeUint(1);

      // Check milestone details
      const milestone = simnet.callReadOnlyFn(
        'proposal',
        'get-proposal-milestone',
        [Cl.uint(proposalId), Cl.uint(1)],
        deployer
      );
      expect(milestone.result).toBeSome();
      const details = milestone.result.value.data;
      expect(details['title']).toBeStringAscii('Research Phase 1');
      expect(details['funding-percentage']).toBeUint(25);
    });

    it('should reject milestone addition from non-researchers', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'add-proposal-milestone',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.stringAscii('Invalid Milestone'),
          Cl.stringAscii('Should fail'),
          Cl.uint(25),
          Cl.uint(simnet.blockHeight + 2016),
          Cl.stringAscii('None'),
          Cl.stringAscii('None')
        ],
        reviewer1 // Not the researcher
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it('should reject invalid funding percentages', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'add-proposal-milestone',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.stringAscii('Invalid Percentage'),
          Cl.stringAscii('Testing invalid percentage'),
          Cl.uint(150), // 150% - invalid
          Cl.uint(simnet.blockHeight + 2016),
          Cl.stringAscii('Test'),
          Cl.stringAscii('Test')
        ],
        researcher1
      );

      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-PROPOSAL
    });
  });

  describe('Proposal Reviews', () => {
    let proposalId: number;

    beforeEach(() => {
      // Setup proposal for review
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );
      simnet.callPublicFn('proposal', 'verify-researcher', [Cl.principal(researcher1)], deployer);

      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);
      const submitResult = simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('Review Test'),
          Cl.stringAscii('Proposal for review testing'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(300000000),
          Cl.uint(3),
          Cl.uint(6048),
          Cl.stringAscii('Test'),
          Cl.none()
        ],
        researcher1
      );
      proposalId = submitResult.result.value.data['proposal-id'];
    });

    it('should allow token holders to submit reviews', () => {
      const commentsHash = new Uint8Array(32).fill(3);

      const { result } = simnet.callPublicFn(
        'proposal',
        'submit-proposal-review',
        [
          Cl.uint(proposalId),
          Cl.uint(85), // Technical score
          Cl.uint(75), // Feasibility score
          Cl.uint(90), // Impact score
          Cl.uint(70), // Budget score
          Cl.bufferFromHex(Buffer.from(commentsHash).toString('hex'))
        ],
        reviewer1
      );

      expect(result).toBeOk();
      const reviewData = result.value.data;
      expect(reviewData['proposal-id']).toBeUint(proposalId);
      expect(reviewData['reviewer']).toBePrincipal(reviewer1);
      expect(reviewData['overall-score']).toBeUint(80); // Average of scores

      // Check review was recorded
      const review = simnet.callReadOnlyFn(
        'proposal',
        'get-proposal-review',
        [Cl.uint(proposalId), Cl.principal(reviewer1)],
        deployer
      );
      expect(review.result).toBeSome();
      const reviewDetails = review.result.value.data;
      expect(reviewDetails['technical-score']).toBeUint(85);
      expect(reviewDetails['overall-score']).toBeUint(80);
    });

    it('should reject reviews from researchers on their own proposals', () => {
      const commentsHash = new Uint8Array(32).fill(3);

      const { result } = simnet.callPublicFn(
        'proposal',
        'submit-proposal-review',
        [
          Cl.uint(proposalId),
          Cl.uint(100),
          Cl.uint(100),
          Cl.uint(100),
          Cl.uint(100),
          Cl.bufferFromHex(Buffer.from(commentsHash).toString('hex'))
        ],
        researcher1 // Researcher reviewing their own proposal
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it('should reject reviews with invalid scores', () => {
      const commentsHash = new Uint8Array(32).fill(3);

      const { result } = simnet.callPublicFn(
        'proposal',
        'submit-proposal-review',
        [
          Cl.uint(proposalId),
          Cl.uint(150), // Invalid score > 100
          Cl.uint(75),
          Cl.uint(90),
          Cl.uint(70),
          Cl.bufferFromHex(Buffer.from(commentsHash).toString('hex'))
        ],
        reviewer1
      );

      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-PROPOSAL
    });

    it('should reject reviews from users without governance tokens', () => {
      const commentsHash = new Uint8Array(32).fill(3);

      const { result } = simnet.callPublicFn(
        'proposal',
        'submit-proposal-review',
        [
          Cl.uint(proposalId),
          Cl.uint(80),
          Cl.uint(75),
          Cl.uint(85),
          Cl.uint(70),
          Cl.bufferFromHex(Buffer.from(commentsHash).toString('hex'))
        ],
        accounts.get('wallet_5')! // No governance tokens
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });
  });

  describe('Proposal Status Management', () => {
    let proposalId: number;

    beforeEach(() => {
      // Setup proposal
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );
      simnet.callPublicFn('proposal', 'verify-researcher', [Cl.principal(researcher1)], deployer);

      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);
      const submitResult = simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('Status Test'),
          Cl.stringAscii('Testing status updates'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(400000000),
          Cl.uint(4),
          Cl.uint(8064),
          Cl.stringAscii('Test'),
          Cl.none()
        ],
        researcher1
      );
      proposalId = submitResult.result.value.data['proposal-id'];
    });

    it('should allow contract owner to update proposal status', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'update-proposal-status',
        [Cl.uint(proposalId), Cl.stringAscii('approved')],
        deployer
      );

      expect(result).toBeOk();
      const statusData = result.value.data;
      expect(statusData['proposal-id']).toBeUint(proposalId);
      expect(statusData['new-status']).toBeStringAscii('approved');

      // Check proposal status updated
      const proposal = simnet.callReadOnlyFn(
        'proposal',
        'get-proposal',
        [Cl.uint(proposalId)],
        deployer
      );
      const proposalData = proposal.result.value.data;
      expect(proposalData['status']).toBeStringAscii('approved');
    });

    it('should reject status updates from non-owner', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'update-proposal-status',
        [Cl.uint(proposalId), Cl.stringAscii('approved')],
        researcher1 // Not the contract owner
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });
  });

  describe('Reputation Management', () => {
    beforeEach(() => {
      // Register researcher
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );
    });

    it('should allow contract owner to update researcher reputation', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'update-researcher-reputation',
        [Cl.principal(researcher1), Cl.uint(85)],
        deployer
      );

      expect(result).toBeOk();
      const reputationData = result.value.data;
      expect(reputationData['researcher']).toBePrincipal(researcher1);
      expect(reputationData['new-reputation']).toBeUint(85);

      // Check reputation updated
      const profile = simnet.callReadOnlyFn(
        'proposal',
        'get-researcher-profile',
        [Cl.principal(researcher1)],
        deployer
      );
      const profileData = profile.result.value.data;
      expect(profileData['reputation-score']).toBeUint(85);
    });

    it('should reject reputation updates from non-owner', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'update-researcher-reputation',
        [Cl.principal(researcher1), Cl.uint(85)],
        researcher2 // Not the contract owner
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it('should reject invalid reputation scores', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'update-researcher-reputation',
        [Cl.principal(researcher1), Cl.uint(150)], // Invalid score > 100
        deployer
      );

      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-PROPOSAL
    });
  });

  describe('Admin Functions', () => {
    it('should allow contract owner to pause proposals', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'pause-proposals',
        [],
        deployer
      );

      expect(result).toBeOk();
      expect(result.value).toBeBool(true);
    });

    it('should reject pause from non-owner', () => {
      const { result } = simnet.callPublicFn(
        'proposal',
        'pause-proposals',
        [],
        researcher1
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it('should prevent registrations when paused', () => {
      // Pause proposals
      simnet.callPublicFn('proposal', 'pause-proposals', [], deployer);

      // Try to register while paused
      const credentialsHash = new Uint8Array(32).fill(1);
      const { result } = simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Paused Test'),
          Cl.stringAscii('Test University'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });
  });

  describe('Read-only Functions', () => {
    it('should return total proposals count', () => {
      const totalBefore = simnet.callReadOnlyFn(
        'proposal',
        'get-total-proposals',
        [],
        deployer
      );
      expect(totalBefore.result).toBeUint(0);

      // Register, verify, and submit proposal
      const credentialsHash = new Uint8Array(32).fill(1);
      simnet.callPublicFn(
        'proposal',
        'register-researcher',
        [
          Cl.stringAscii('Dr. Alice Smith'),
          Cl.stringAscii('MIT'),
          Cl.bufferFromHex(Buffer.from(credentialsHash).toString('hex'))
        ],
        researcher1
      );
      simnet.callPublicFn('proposal', 'verify-researcher', [Cl.principal(researcher1)], deployer);

      const methodologyHash = new Uint8Array(32).fill(1);
      const budgetHash = new Uint8Array(32).fill(2);
      simnet.callPublicFn(
        'proposal',
        'submit-detailed-proposal',
        [
          Cl.stringAscii('Test Research'),
          Cl.stringAscii('Test proposal'),
          Cl.bufferFromHex(Buffer.from(methodologyHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(budgetHash).toString('hex')),
          Cl.uint(200000000),
          Cl.uint(3),
          Cl.uint(6048),
          Cl.stringAscii('Test'),
          Cl.none()
        ],
        researcher1
      );

      const totalAfter = simnet.callReadOnlyFn(
        'proposal',
        'get-total-proposals',
        [],
        deployer
      );
      expect(totalAfter.result).toBeUint(1);
    });

    it('should calculate proposal scores correctly', () => {
      const score = simnet.callReadOnlyFn(
        'proposal',
        'calculate-proposal-score',
        [Cl.uint(1)],
        deployer
      );

      expect(score.result).toBeSome();
      const scoreData = score.result.value.data;
      expect(scoreData['proposal-id']).toBeUint(1);
      expect(scoreData['average-score']).toBeUint(75);
      expect(scoreData['review-count']).toBeUint(3);
    });
  });
});