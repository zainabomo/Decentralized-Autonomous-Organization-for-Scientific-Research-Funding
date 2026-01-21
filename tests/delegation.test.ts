import { describe, it, expect, beforeEach } from 'vitest';
import { Cl, ClarityType } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const delegator1 = accounts.get('wallet_1')!;
const delegator2 = accounts.get('wallet_2')!;
const delegate1 = accounts.get('wallet_3')!;
const delegate2 = accounts.get('wallet_4')!;

/**
 * Delegation Contract Tests
 * 
 * Tests the vote delegation system which allows governance token holders
 * to delegate their voting power to trusted representatives.
 */
describe('Delegation Contract Tests', () => {

    /**
     * Helper function to contribute sBTC and get governance tokens
     */
    const setupUserWithTokens = (user: string, amount: number) => {
        simnet.callPublicFn(
            'treasury',
            'contribute-sbtc',
            [Cl.uint(amount)],
            user
        );
    };

    /**
     * Helper to check if a result is Ok
     */
    const isOk = (result: any): boolean => {
        return result.type === ClarityType.ResponseOk;
    };

    // ============================================
    // Basic Delegation Tests
    // ============================================
    
    describe('Basic Delegation Operations', () => {
        
        beforeEach(() => {
            setupUserWithTokens(delegator1, 100000000);  // 1000 tokens
            setupUserWithTokens(delegator2, 200000000);  // 2000 tokens
            setupUserWithTokens(delegate1, 50000000);    // 500 tokens
        });

        it('should allow a user to delegate voting power', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );

            // Verify successful delegation
            expect(isOk(result)).toBe(true);
        });

        it('should correctly track delegation info', () => {
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );

            const { result } = simnet.callReadOnlyFn(
                'delegation',
                'get-delegation',
                [Cl.principal(delegator1)],
                deployer
            );

            // Verify delegation was stored (not none)
            expect(result.type).toBe(ClarityType.OptionalSome);
        });

        it('should reject delegation to self', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegator1), Cl.uint(500), Cl.uint(0)],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(502)); // ERR-CANNOT-DELEGATE-TO-SELF
        });

        it('should reject delegation exceeding token balance', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(5000), Cl.uint(0)],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(503)); // ERR-INSUFFICIENT-BALANCE
        });

        it('should reject duplicate delegation', () => {
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(500), Cl.uint(0)],
                delegator1
            );

            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate2), Cl.uint(500), Cl.uint(0)],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(500)); // ERR-ALREADY-DELEGATED
        });
    });

    // ============================================
    // Delegation Chain Prevention
    // ============================================
    
    describe('Delegation Chain Prevention', () => {
        
        beforeEach(() => {
            setupUserWithTokens(delegator1, 100000000);
            setupUserWithTokens(delegate1, 100000000);
        });

        it('should prevent delegation chains', () => {
            // delegate1 delegates their power
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegator1), Cl.uint(500), Cl.uint(0)],
                delegate1
            );

            // delegator1 tries to delegate to delegate1 who already delegated
            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(500), Cl.uint(0)],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(506)); // ERR-DELEGATION-CHAIN-NOT-ALLOWED
        });
    });

    // ============================================
    // Revocation Tests
    // ============================================
    
    describe('Delegation Revocation', () => {
        
        beforeEach(() => {
            setupUserWithTokens(delegator1, 100000000);
            setupUserWithTokens(delegate1, 50000000);
            
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );
        });

        it('should allow user to revoke delegation', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'revoke-delegation',
                [],
                delegator1
            );

            // Verify successful revocation
            expect(isOk(result)).toBe(true);
        });

        it('should remove delegation record after revocation', () => {
            simnet.callPublicFn('delegation', 'revoke-delegation', [], delegator1);

            const { result } = simnet.callReadOnlyFn(
                'delegation',
                'get-delegation',
                [Cl.principal(delegator1)],
                deployer
            );

            expect(result).toBeNone();
        });

        it('should reject revocation if not delegated', () => {
            simnet.callPublicFn('delegation', 'revoke-delegation', [], delegator1);

            const { result } = simnet.callPublicFn(
                'delegation',
                'revoke-delegation',
                [],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(501)); // ERR-NOT-DELEGATED
        });
    });

    // ============================================
    // Lock Period Tests
    // ============================================
    
    describe('Delegation Lock Period', () => {
        
        beforeEach(() => {
            setupUserWithTokens(delegator1, 100000000);
            setupUserWithTokens(delegate1, 50000000);
        });

        it('should accept valid lock period', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(1000)],
                delegator1
            );

            expect(isOk(result)).toBe(true);
        });

        it('should reject lock period exceeding maximum', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(20000)],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(508)); // ERR-INVALID-LOCK-PERIOD
        });

        it('should correctly identify locked delegations', () => {
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(100)],
                delegator1
            );

            const { result } = simnet.callReadOnlyFn(
                'delegation',
                'is-delegation-locked',
                [Cl.principal(delegator1)],
                deployer
            );

            expect(result).toBeBool(true);
        });
    });

    // ============================================
    // Effective Voting Power Tests
    // ============================================
    
    describe('Effective Voting Power Calculation', () => {
        
        beforeEach(() => {
            setupUserWithTokens(delegator1, 100000000);  // 1000 tokens
            setupUserWithTokens(delegator2, 200000000);  // 2000 tokens
            setupUserWithTokens(delegate1, 50000000);    // 500 tokens
        });

        it('should return own tokens when not delegated', () => {
            const { result } = simnet.callReadOnlyFn(
                'delegation',
                'get-effective-voting-power',
                [Cl.principal(delegator1)],
                deployer
            );

            expect(result).toBeUint(1000);
        });

        it('should return zero when delegated away', () => {
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );

            const { result } = simnet.callReadOnlyFn(
                'delegation',
                'get-effective-voting-power',
                [Cl.principal(delegator1)],
                deployer
            );

            expect(result).toBeUint(0);
        });

        it('should include delegated power for delegates', () => {
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );

            const { result } = simnet.callReadOnlyFn(
                'delegation',
                'get-effective-voting-power',
                [Cl.principal(delegate1)],
                deployer
            );

            // delegate1's own 500 tokens + 1000 delegated = 1500
            expect(result).toBeUint(1500);
        });

        it('should accumulate multiple delegations', () => {
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );
            
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(2000), Cl.uint(0)],
                delegator2
            );

            const { result } = simnet.callReadOnlyFn(
                'delegation',
                'get-effective-voting-power',
                [Cl.principal(delegate1)],
                deployer
            );

            // delegate1's own 500 + 1000 + 2000 = 3500
            expect(result).toBeUint(3500);
        });
    });

    // ============================================
    // Admin Functions Tests
    // ============================================
    
    describe('Admin Functions', () => {
        
        beforeEach(() => {
            setupUserWithTokens(delegator1, 100000000);
            setupUserWithTokens(delegate1, 50000000);
        });

        it('should allow contract owner to pause delegation', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'pause-delegation',
                [],
                deployer
            );

            expect(isOk(result)).toBe(true);
        });

        it('should reject new delegations when paused', () => {
            simnet.callPublicFn('delegation', 'pause-delegation', [], deployer);

            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(500), Cl.uint(0)],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(509)); // ERR-DELEGATION-PAUSED
        });

        it('should allow unpause and resume delegation', () => {
            simnet.callPublicFn('delegation', 'pause-delegation', [], deployer);
            simnet.callPublicFn('delegation', 'unpause-delegation', [], deployer);

            const { result } = simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(500), Cl.uint(0)],
                delegator1
            );

            expect(isOk(result)).toBe(true);
        });

        it('should reject pause from non-owner', () => {
            const { result } = simnet.callPublicFn(
                'delegation',
                'pause-delegation',
                [],
                delegator1
            );

            expect(result).toBeErr(Cl.uint(507)); // ERR-UNAUTHORIZED
        });

        it('should allow admin to emergency revoke delegation', () => {
            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );

            const { result } = simnet.callPublicFn(
                'delegation',
                'admin-revoke-delegation',
                [Cl.principal(delegator1)],
                deployer
            );

            // Verify successful admin revocation
            expect(isOk(result)).toBe(true);
            
            // Verify delegation was removed
            const { result: delegation } = simnet.callReadOnlyFn(
                'delegation',
                'get-delegation',
                [Cl.principal(delegator1)],
                deployer
            );
            expect(delegation).toBeNone();
        });
    });

    // ============================================
    // Helper Functions Tests
    // ============================================
    
    describe('Helper Read Functions', () => {
        
        beforeEach(() => {
            setupUserWithTokens(delegator1, 100000000);
            setupUserWithTokens(delegate1, 50000000);
        });

        it('should correctly check if user has delegated', () => {
            let { result } = simnet.callReadOnlyFn(
                'delegation',
                'has-delegated',
                [Cl.principal(delegator1)],
                deployer
            );
            expect(result).toBeBool(false);

            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );

            ({ result } = simnet.callReadOnlyFn(
                'delegation',
                'has-delegated',
                [Cl.principal(delegator1)],
                deployer
            ));
            expect(result).toBeBool(true);
        });

        it('should check can-delegate correctly', () => {
            let { result } = simnet.callReadOnlyFn(
                'delegation',
                'can-delegate',
                [Cl.principal(delegator1), Cl.uint(500)],
                deployer
            );
            expect(result).toBeBool(true);

            simnet.callPublicFn(
                'delegation',
                'delegate-voting-power',
                [Cl.principal(delegate1), Cl.uint(1000), Cl.uint(0)],
                delegator1
            );

            ({ result } = simnet.callReadOnlyFn(
                'delegation',
                'can-delegate',
                [Cl.principal(delegator1), Cl.uint(500)],
                deployer
            ));
            expect(result).toBeBool(false);
        });
    });
});
