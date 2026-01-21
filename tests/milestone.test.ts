import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const researcher = accounts.get('wallet_1')!;
const verifier1 = accounts.get('wallet_2')!;
const verifier2 = accounts.get('wallet_3')!;
const verifier3 = accounts.get('wallet_4')!;

describe('Milestone Contract Tests', () => {
  let proposalId: number;

  beforeEach(() => {
    proposalId = 1;
    
    // Setup governance tokens for verifiers
    simnet.callPublicFn('treasury', 'contribute-sbtc', [Cl.uint(100000000)], verifier1);
    simnet.callPublicFn('treasury', 'contribute-sbtc', [Cl.uint(100000000)], verifier2);
    simnet.callPublicFn('treasury', 'contribute-sbtc', [Cl.uint(100000000)], verifier3);
    
    // Setup treasury with funds
    simnet.callPublicFn('treasury', 'contribute-sbtc', [Cl.uint(1000000000)], deployer);
  });

  describe('Project Milestone Initialization', () => {
    it('should initialize project milestones correctly', () => {
      const totalBudget = 400000000; // 4 sBTC
      const milestoneDescriptions = [
        'Research Phase 1',
        'Data Collection',
        'Analysis Phase',
        'Final Report'
      ];
      const milestoneBudgets = [100000000, 100000000, 100000000, 100000000];
      const milestoneDeadlines = [
        simnet.blockHeight + 2016,
        simnet.blockHeight + 4032,
        simnet.blockHeight + 6048,
        simnet.blockHeight + 8064
      ];

      const { result } = simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(4),
          Cl.uint(totalBudget),
          Cl.list(milestoneDescriptions.map(desc => Cl.stringAscii(desc))),
          Cl.list(milestoneBudgets.map(budget => Cl.uint(budget))),
          Cl.list(milestoneDeadlines.map(deadline => Cl.uint(deadline)))
        ],
        deployer
      );

      expect(result).toBeOk();
      expect(result.value).toBeUint(proposalId);

      // Check project milestone data
      const projectData = simnet.callReadOnlyFn(
        'milestone',
        'get-project-milestones',
        [Cl.uint(proposalId)],
        deployer
      );
      expect(projectData.result).toBeSome();
      const project = projectData.result.value.data;
      expect(project['researcher']).toBePrincipal(researcher);
      expect(project['total-milestones']).toBeUint(4);
      expect(project['total-budget']).toBeUint(totalBudget);
      expect(project['status']).toBeStringAscii('active');
    });

    it('should reject initialization with invalid parameters', () => {
      const { result } = simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(0), // Invalid milestone count
          Cl.uint(400000000),
          Cl.list([]),
          Cl.list([]),
          Cl.list([])
        ],
        deployer
      );

      expect(result).toBeErr(Cl.uint(303)); // ERR-INVALID-MILESTONE
    });

    it('should only allow contract owner to initialize milestones', () => {
      const { result } = simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(4),
          Cl.uint(400000000),
          Cl.list([Cl.stringAscii('Test')]),
          Cl.list([Cl.uint(100000000)]),
          Cl.list([Cl.uint(simnet.blockHeight + 2016)])
        ],
        researcher // Not the contract owner
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });
  });

  describe('Milestone Report Submission', () => {
    beforeEach(() => {
      // Initialize project milestones
      const milestoneDescriptions = ['Research Phase 1', 'Data Collection'];
      const milestoneBudgets = [200000000, 200000000];
      const milestoneDeadlines = [simnet.blockHeight + 2016, simnet.blockHeight + 4032];

      simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(2),
          Cl.uint(400000000),
          Cl.list(milestoneDescriptions.map(desc => Cl.stringAscii(desc))),
          Cl.list(milestoneBudgets.map(budget => Cl.uint(budget))),
          Cl.list(milestoneDeadlines.map(deadline => Cl.uint(deadline)))
        ],
        deployer
      );
    });

    it('should allow researchers to submit milestone reports', () => {
      const reportHash = new Uint8Array(32).fill(1);
      const deliverablesHash = new Uint8Array(32).fill(2);

      const { result } = simnet.callPublicFn(
        'milestone',
        'submit-milestone-report',
        [
          Cl.uint(proposalId),
          Cl.uint(1), // First milestone
          Cl.bufferFromHex(Buffer.from(reportHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(deliverablesHash).toString('hex'))
        ],
        researcher
      );

      expect(result).toBeOk();
      const submissionData = result.value.data;
      expect(submissionData['proposal-id']).toBeUint(proposalId);
      expect(submissionData['milestone-id']).toBeUint(1);
      expect(submissionData['status']).toBeStringAscii('submitted');

      // Check milestone status updated
      const milestone = simnet.callReadOnlyFn(
        'milestone',
        'get-milestone',
        [Cl.uint(proposalId), Cl.uint(1)],
        deployer
      );
      expect(milestone.result).toBeSome();
      const milestoneData = milestone.result.value.data;
      expect(milestoneData['status']).toBeStringAscii('submitted');
    });

    it('should reject submissions from non-researchers', () => {
      const reportHash = new Uint8Array(32).fill(1);
      const deliverablesHash = new Uint8Array(32).fill(2);

      const { result } = simnet.callPublicFn(
        'milestone',
        'submit-milestone-report',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.bufferFromHex(Buffer.from(reportHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(deliverablesHash).toString('hex'))
        ],
        verifier1 // Not the researcher
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });

    it('should reject submissions after deadline', () => {
      // Advance past deadline
      simnet.mineEmptyBlocks(2017);

      const reportHash = new Uint8Array(32).fill(1);
      const deliverablesHash = new Uint8Array(32).fill(2);

      const { result } = simnet.callPublicFn(
        'milestone',
        'submit-milestone-report',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.bufferFromHex(Buffer.from(reportHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(deliverablesHash).toString('hex'))
        ],
        researcher
      );

      expect(result).toBeErr(Cl.uint(306)); // ERR-DEADLINE-PASSED
    });
  });

  describe('Milestone Verification', () => {
    beforeEach(() => {
      // Initialize and submit milestone
      const milestoneDescriptions = ['Research Phase 1'];
      const milestoneBudgets = [200000000];
      const milestoneDeadlines = [simnet.blockHeight + 2016];

      simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(1),
          Cl.uint(200000000),
          Cl.list(milestoneDescriptions.map(desc => Cl.stringAscii(desc))),
          Cl.list(milestoneBudgets.map(budget => Cl.uint(budget))),
          Cl.list(milestoneDeadlines.map(deadline => Cl.uint(deadline)))
        ],
        deployer
      );

      // Submit milestone report
      const reportHash = new Uint8Array(32).fill(1);
      const deliverablesHash = new Uint8Array(32).fill(2);
      simnet.callPublicFn(
        'milestone',
        'submit-milestone-report',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.bufferFromHex(Buffer.from(reportHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(deliverablesHash).toString('hex'))
        ],
        researcher
      );
    });

    it('should allow token holders to verify milestones', () => {
      const commentsHash = new Uint8Array(32).fill(3);

      const { result } = simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.bool(true), // Verified
          Cl.some(Cl.bufferFromHex(Buffer.from(commentsHash).toString('hex')))
        ],
        verifier1
      );

      expect(result).toBeOk();
      const verificationData = result.value.data;
      expect(verificationData['proposal-id']).toBeUint(proposalId);
      expect(verificationData['milestone-id']).toBeUint(1);
      expect(verificationData['verified']).toBeBool(true);
      expect(verificationData['verifier']).toBePrincipal(verifier1);

      // Check verification was recorded
      const verification = simnet.callReadOnlyFn(
        'milestone',
        'get-milestone-verification',
        [Cl.uint(proposalId), Cl.uint(1), Cl.principal(verifier1)],
        deployer
      );
      expect(verification.result).toBeSome();
    });

    it('should update verification count for positive verifications', () => {
      // Multiple verifications
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier1
      );
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier2
      );
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier3
      );

      // Check milestone verification count
      const milestone = simnet.callReadOnlyFn(
        'milestone',
        'get-milestone',
        [Cl.uint(proposalId), Cl.uint(1)],
        deployer
      );
      const milestoneData = milestone.result.value.data;
      expect(milestoneData['verification-count']).toBeUint(3);
    });

    it('should reject verifications from users without governance tokens', () => {
      const { result } = simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        accounts.get('wallet_5')! // No governance tokens
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });

    it('should prevent duplicate verifications from same user', () => {
      // First verification
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier1
      );

      // Attempt duplicate verification
      const { result } = simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(false), Cl.none()],
        verifier1
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });
  });

  describe('Milestone Funding Release', () => {
    beforeEach(() => {
      // Setup complete milestone ready for funding
      const milestoneDescriptions = ['Research Phase 1'];
      const milestoneBudgets = [200000000];
      const milestoneDeadlines = [simnet.blockHeight + 2016];

      // Initialize milestones
      simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(1),
          Cl.uint(200000000),
          Cl.list(milestoneDescriptions.map(desc => Cl.stringAscii(desc))),
          Cl.list(milestoneBudgets.map(budget => Cl.uint(budget))),
          Cl.list(milestoneDeadlines.map(deadline => Cl.uint(deadline)))
        ],
        deployer
      );

      // Submit milestone report
      const reportHash = new Uint8Array(32).fill(1);
      const deliverablesHash = new Uint8Array(32).fill(2);
      simnet.callPublicFn(
        'milestone',
        'submit-milestone-report',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.bufferFromHex(Buffer.from(reportHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(deliverablesHash).toString('hex'))
        ],
        researcher
      );

      // Get required verifications (3)
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier1
      );
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier2
      );
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier3
      );

      // Approve proposal in treasury
      simnet.callPublicFn(
        'treasury',
        'approve-proposal',
        [Cl.uint(proposalId), Cl.principal(researcher), Cl.uint(200000000)],
        deployer
      );
    });

    it('should release funding for verified milestones', () => {
      const { result } = simnet.callPublicFn(
        'milestone',
        'release-milestone-funding',
        [Cl.uint(proposalId), Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk();
      const releaseData = result.value.data;
      expect(releaseData['proposal-id']).toBeUint(proposalId);
      expect(releaseData['milestone-id']).toBeUint(1);
      expect(releaseData['funding-released']).toBeUint(200000000);

      // Check milestone status updated to completed
      const milestone = simnet.callReadOnlyFn(
        'milestone',
        'get-milestone',
        [Cl.uint(proposalId), Cl.uint(1)],
        deployer
      );
      const milestoneData = milestone.result.value.data;
      expect(milestoneData['status']).toBeStringAscii('completed');
    });

    it('should reject funding release without sufficient verifications', () => {
      // Create new milestone without enough verifications
      const milestoneDescriptions = ['Phase 2'];
      const milestoneBudgets = [100000000];
      const milestoneDeadlines = [simnet.blockHeight + 2016];

      simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(2), // New proposal ID
          Cl.principal(researcher),
          Cl.uint(1),
          Cl.uint(100000000),
          Cl.list(milestoneDescriptions.map(desc => Cl.stringAscii(desc))),
          Cl.list(milestoneBudgets.map(budget => Cl.uint(budget))),
          Cl.list(milestoneDeadlines.map(deadline => Cl.uint(deadline)))
        ],
        deployer
      );

      // Submit but don't verify
      const reportHash = new Uint8Array(32).fill(1);
      const deliverablesHash = new Uint8Array(32).fill(2);
      simnet.callPublicFn(
        'milestone',
        'submit-milestone-report',
        [
          Cl.uint(2),
          Cl.uint(1),
          Cl.bufferFromHex(Buffer.from(reportHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(deliverablesHash).toString('hex'))
        ],
        researcher
      );

      // Try to release funding without verifications
      const { result } = simnet.callPublicFn(
        'milestone',
        'release-milestone-funding',
        [Cl.uint(2), Cl.uint(1)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(305)); // ERR-INSUFFICIENT-VERIFICATIONS
    });

    it('should only allow contract owner to release funding', () => {
      const { result } = simnet.callPublicFn(
        'milestone',
        'release-milestone-funding',
        [Cl.uint(proposalId), Cl.uint(1)],
        researcher // Not the contract owner
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });
  });

  describe('Project Progress Tracking', () => {
    beforeEach(() => {
      // Initialize project with multiple milestones
      const milestoneDescriptions = ['Phase 1', 'Phase 2', 'Phase 3'];
      const milestoneBudgets = [100000000, 150000000, 150000000];
      const milestoneDeadlines = [
        simnet.blockHeight + 2016,
        simnet.blockHeight + 4032,
        simnet.blockHeight + 6048
      ];

      simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(3),
          Cl.uint(400000000),
          Cl.list(milestoneDescriptions.map(desc => Cl.stringAscii(desc))),
          Cl.list(milestoneBudgets.map(budget => Cl.uint(budget))),
          Cl.list(milestoneDeadlines.map(deadline => Cl.uint(deadline)))
        ],
        deployer
      );
    });

    it('should track project progress correctly', () => {
      const progress = simnet.callReadOnlyFn(
        'milestone',
        'get-project-progress',
        [Cl.uint(proposalId)],
        deployer
      );

      expect(progress.result).toBeSome();
      const progressData = progress.result.value.data;
      expect(progressData['proposal-id']).toBeUint(proposalId);
      expect(progressData['completed-milestones']).toBeUint(0);
      expect(progressData['total-milestones']).toBeUint(3);
      expect(progressData['progress-percentage']).toBeUint(0);
      expect(progressData['status']).toBeStringAscii('active');
    });

    it('should check if milestone is ready for funding', () => {
      // Submit and verify first milestone
      const reportHash = new Uint8Array(32).fill(1);
      const deliverablesHash = new Uint8Array(32).fill(2);
      
      simnet.callPublicFn(
        'milestone',
        'submit-milestone-report',
        [
          Cl.uint(proposalId),
          Cl.uint(1),
          Cl.bufferFromHex(Buffer.from(reportHash).toString('hex')),
          Cl.bufferFromHex(Buffer.from(deliverablesHash).toString('hex'))
        ],
        researcher
      );

      // Add verifications
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier1
      );
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier2
      );
      simnet.callPublicFn(
        'milestone',
        'verify-milestone',
        [Cl.uint(proposalId), Cl.uint(1), Cl.bool(true), Cl.none()],
        verifier3
      );

      // Check if ready for funding
      const isReady = simnet.callReadOnlyFn(
        'milestone',
        'is-milestone-ready-for-funding',
        [Cl.uint(proposalId), Cl.uint(1)],
        deployer
      );
      expect(isReady.result).toBeBool(true);
    });
  });

  describe('Deadline Management', () => {
    beforeEach(() => {
      // Initialize project
      const milestoneDescriptions = ['Test Phase'];
      const milestoneBudgets = [200000000];
      const milestoneDeadlines = [simnet.blockHeight + 2016];

      simnet.callPublicFn(
        'milestone',
        'initialize-project-milestones',
        [
          Cl.uint(proposalId),
          Cl.principal(researcher),
          Cl.uint(1),
          Cl.uint(200000000),
          Cl.list(milestoneDescriptions.map(desc => Cl.stringAscii(desc))),
          Cl.list(milestoneBudgets.map(budget => Cl.uint(budget))),
          Cl.list(milestoneDeadlines.map(deadline => Cl.uint(deadline)))
        ],
        deployer
      );
    });

    it('should allow researchers to extend milestone deadlines', () => {
      const extensionBlocks = 1000;

      const { result } = simnet.callPublicFn(
        'milestone',
        'extend-milestone-deadline',
        [Cl.uint(proposalId), Cl.uint(1), Cl.uint(extensionBlocks)],
        researcher
      );

      expect(result).toBeOk();
      const extensionData = result.value.data;
      expect(extensionData['proposal-id']).toBeUint(proposalId);
      expect(extensionData['milestone-id']).toBeUint(1);
      expect(extensionData['new-deadline']).toBeUint(simnet.blockHeight + 2016 + extensionBlocks);
    });

    it('should reject excessive deadline extensions', () => {
      const excessiveExtension = 3000; // More than allowed

      const { result } = simnet.callPublicFn(
        'milestone',
        'extend-milestone-deadline',
        [Cl.uint(proposalId), Cl.uint(1), Cl.uint(excessiveExtension)],
        researcher
      );

      expect(result).toBeErr(Cl.uint(303)); // ERR-INVALID-MILESTONE
    });

    it('should only allow researchers to extend their own deadlines', () => {
      const { result } = simnet.callPublicFn(
        'milestone',
        'extend-milestone-deadline',
        [Cl.uint(proposalId), Cl.uint(1), Cl.uint(1000)],
        verifier1 // Not the researcher
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });
  });
});