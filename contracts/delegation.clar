;; Research Funding DAO - Delegation Contract
;; Allows governance token holders to delegate their voting power to other addresses
;; 
;; This contract enables:
;; - Token holders to delegate voting power to trusted representatives
;; - Delegates to accumulate voting power from multiple delegators
;; - Delegators to revoke delegation at any time
;; - Time-locked delegations for specific proposal windows
;; - Delegation chains prevention (delegates cannot re-delegate)

;; ============================================
;; Constants
;; ============================================

(define-constant CONTRACT-OWNER tx-sender)

;; Error codes
(define-constant ERR-ALREADY-DELEGATED (err u500))
(define-constant ERR-NOT-DELEGATED (err u501))
(define-constant ERR-CANNOT-DELEGATE-TO-SELF (err u502))
(define-constant ERR-INSUFFICIENT-BALANCE (err u503))
(define-constant ERR-DELEGATION-LOCKED (err u504))
(define-constant ERR-INVALID-DELEGATE (err u505))
(define-constant ERR-DELEGATION-CHAIN-NOT-ALLOWED (err u506))
(define-constant ERR-UNAUTHORIZED (err u507))
(define-constant ERR-INVALID-LOCK-PERIOD (err u508))
(define-constant ERR-DELEGATION-PAUSED (err u509))

;; Configuration constants
(define-constant MAX-LOCK-PERIOD u10080) ;; Maximum lock period (~1 week in blocks)
(define-constant MIN-DELEGATION-AMOUNT u1) ;; Minimum tokens to delegate

;; ============================================
;; Data Variables
;; ============================================

(define-data-var delegation-counter uint u0)
(define-data-var delegation-paused bool false)
(define-data-var total-delegated-power uint u0)

;; ============================================
;; Data Maps
;; ============================================

;; Primary delegation record: maps delegator -> delegation info
(define-map delegations principal {
    delegate: principal,
    amount: uint,
    delegation-time: uint,
    lock-until: uint,
    delegation-id: uint
})

;; Aggregated power received by delegates
(define-map delegate-power principal {
    total-received: uint,
    delegator-count: uint,
    first-delegation: uint,
    last-update: uint
})

;; Track individual delegations for a delegate (for enumeration)
(define-map delegate-delegators {delegate: principal, delegator: principal} {
    amount: uint,
    delegation-time: uint
})

;; Delegation history for transparency
(define-map delegation-history uint {
    delegator: principal,
    delegate: principal,
    amount: uint,
    action: (string-ascii 20),
    block-height: uint
})

;; ============================================
;; Read-Only Functions
;; ============================================

;; Get delegation info for a delegator
(define-read-only (get-delegation (delegator principal))
    (map-get? delegations delegator)
)

;; Get total voting power received by a delegate
(define-read-only (get-delegate-power (delegate principal))
    (default-to {
        total-received: u0,
        delegator-count: u0,
        first-delegation: u0,
        last-update: u0
    } (map-get? delegate-power delegate))
)

;; Get effective voting power for a user (own tokens + delegated power)
;; This integrates with the treasury contract for balance checking
(define-read-only (get-effective-voting-power (user principal))
    (let (
        ;; Get user's own governance token balance from treasury
        (own-balance (contract-call? .treasury get-governance-token-balance user))
        ;; Get power delegated TO this user
        (received-power (get total-received (get-delegate-power user)))
        ;; Check if user has delegated away their power
        (user-delegation (map-get? delegations user))
        ;; If delegated, their own tokens don't count toward their voting power
        (active-balance (match user-delegation
            delegation-info u0  ;; If delegated, own balance is 0 for voting
            own-balance         ;; If not delegated, use full balance
        ))
    )
        (+ active-balance received-power)
    )
)

;; Check if a user has delegated their voting power
(define-read-only (has-delegated (delegator principal))
    (is-some (map-get? delegations delegator))
)

;; Check if a delegation is currently locked
(define-read-only (is-delegation-locked (delegator principal))
    (match (map-get? delegations delegator)
        delegation-info (> (get lock-until delegation-info) stacks-block-height)
        false
    )
)

;; Get the delegate for a specific delegator
(define-read-only (get-delegate-for (delegator principal))
    (match (map-get? delegations delegator)
        delegation-info (some (get delegate delegation-info))
        none
    )
)

;; Get delegation statistics
(define-read-only (get-delegation-stats)
    {
        total-delegations: (var-get delegation-counter),
        total-delegated-power: (var-get total-delegated-power),
        is-paused: (var-get delegation-paused)
    }
)

;; Get delegation history entry
(define-read-only (get-delegation-history-entry (entry-id uint))
    (map-get? delegation-history entry-id)
)

;; Check if user can delegate (has balance and hasn't already delegated)
(define-read-only (can-delegate (delegator principal) (amount uint))
    (let (
        (balance (contract-call? .treasury get-governance-token-balance delegator))
        (existing-delegation (map-get? delegations delegator))
    )
        (and 
            (is-none existing-delegation)
            (>= balance amount)
            (>= amount MIN-DELEGATION-AMOUNT)
            (not (var-get delegation-paused))
        )
    )
)

;; ============================================
;; Public Functions
;; ============================================

;; Delegate voting power to another address
;; @param delegate-to: The address to delegate voting power to
;; @param amount: Amount of voting power to delegate (in governance tokens)
;; @param lock-period: Optional number of blocks to lock the delegation
(define-public (delegate-voting-power 
    (delegate-to principal) 
    (amount uint)
    (lock-period uint)
)
    (let (
        (delegator tx-sender)
        (delegator-balance (contract-call? .treasury get-governance-token-balance delegator))
        (existing-delegation (map-get? delegations delegator))
        (delegate-info (get-delegate-power delegate-to))
        (delegation-id (+ (var-get delegation-counter) u1))
        (lock-until (+ stacks-block-height lock-period))
    )
        ;; Validation checks
        (asserts! (not (var-get delegation-paused)) ERR-DELEGATION-PAUSED)
        (asserts! (not (is-eq delegator delegate-to)) ERR-CANNOT-DELEGATE-TO-SELF)
        (asserts! (is-none existing-delegation) ERR-ALREADY-DELEGATED)
        (asserts! (>= delegator-balance amount) ERR-INSUFFICIENT-BALANCE)
        (asserts! (>= amount MIN-DELEGATION-AMOUNT) ERR-INSUFFICIENT-BALANCE)
        (asserts! (<= lock-period MAX-LOCK-PERIOD) ERR-INVALID-LOCK-PERIOD)
        
        ;; Prevent delegation chains: delegate cannot have delegated their own tokens
        (asserts! (is-none (map-get? delegations delegate-to)) ERR-DELEGATION-CHAIN-NOT-ALLOWED)
        
        ;; Create delegation record
        (map-set delegations delegator {
            delegate: delegate-to,
            amount: amount,
            delegation-time: stacks-block-height,
            lock-until: lock-until,
            delegation-id: delegation-id
        })
        
        ;; Update delegate's received power
        (map-set delegate-power delegate-to {
            total-received: (+ (get total-received delegate-info) amount),
            delegator-count: (+ (get delegator-count delegate-info) u1),
            first-delegation: (if (is-eq (get first-delegation delegate-info) u0) 
                                  stacks-block-height 
                                  (get first-delegation delegate-info)),
            last-update: stacks-block-height
        })
        
        ;; Track individual delegation relationship
        (map-set delegate-delegators {delegate: delegate-to, delegator: delegator} {
            amount: amount,
            delegation-time: stacks-block-height
        })
        
        ;; Record in history
        (map-set delegation-history delegation-id {
            delegator: delegator,
            delegate: delegate-to,
            amount: amount,
            action: "delegate",
            block-height: stacks-block-height
        })
        
        ;; Update counters
        (var-set delegation-counter delegation-id)
        (var-set total-delegated-power (+ (var-get total-delegated-power) amount))
        
        (ok {
            delegation-id: delegation-id,
            delegator: delegator,
            delegate: delegate-to,
            amount: amount,
            lock-until: lock-until
        })
    )
)

;; Revoke delegation and reclaim voting power
(define-public (revoke-delegation)
    (let (
        (delegator tx-sender)
        (delegation-info (unwrap! (map-get? delegations delegator) ERR-NOT-DELEGATED))
        (delegate (get delegate delegation-info))
        (amount (get amount delegation-info))
        (delegate-info (get-delegate-power delegate))
        (history-id (+ (var-get delegation-counter) u1))
    )
        ;; Check if delegation is locked
        (asserts! (not (is-delegation-locked delegator)) ERR-DELEGATION-LOCKED)
        
        ;; Remove delegation record
        (map-delete delegations delegator)
        
        ;; Update delegate's received power
        (map-set delegate-power delegate {
            total-received: (- (get total-received delegate-info) amount),
            delegator-count: (- (get delegator-count delegate-info) u1),
            first-delegation: (get first-delegation delegate-info),
            last-update: stacks-block-height
        })
        
        ;; Remove individual delegation tracking
        (map-delete delegate-delegators {delegate: delegate, delegator: delegator})
        
        ;; Record in history
        (map-set delegation-history history-id {
            delegator: delegator,
            delegate: delegate,
            amount: amount,
            action: "revoke",
            block-height: stacks-block-height
        })
        
        ;; Update counters
        (var-set delegation-counter history-id)
        (var-set total-delegated-power (- (var-get total-delegated-power) amount))
        
        (ok {
            delegator: delegator,
            delegate: delegate,
            amount-returned: amount
        })
    )
)

;; Change delegation to a different delegate (revoke + delegate in one transaction)
(define-public (change-delegate 
    (new-delegate principal)
    (lock-period uint)
)
    (let (
        (delegator tx-sender)
        (current-delegation (unwrap! (map-get? delegations delegator) ERR-NOT-DELEGATED))
        (current-amount (get amount current-delegation))
    )
        ;; Check if delegation is locked
        (asserts! (not (is-delegation-locked delegator)) ERR-DELEGATION-LOCKED)
        (asserts! (not (is-eq new-delegate delegator)) ERR-CANNOT-DELEGATE-TO-SELF)
        (asserts! (is-none (map-get? delegations new-delegate)) ERR-DELEGATION-CHAIN-NOT-ALLOWED)
        
        ;; First revoke the current delegation
        (try! (revoke-delegation))
        
        ;; Then delegate to the new delegate
        (delegate-voting-power new-delegate current-amount lock-period)
    )
)

;; Update delegation amount (increase or decrease)
(define-public (update-delegation-amount (new-amount uint))
    (let (
        (delegator tx-sender)
        (delegation-info (unwrap! (map-get? delegations delegator) ERR-NOT-DELEGATED))
        (current-amount (get amount delegation-info))
        (delegate (get delegate delegation-info))
        (delegator-balance (contract-call? .treasury get-governance-token-balance delegator))
        (delegate-info (get-delegate-power delegate))
        (history-id (+ (var-get delegation-counter) u1))
    )
        ;; Check if delegation is locked
        (asserts! (not (is-delegation-locked delegator)) ERR-DELEGATION-LOCKED)
        (asserts! (>= delegator-balance new-amount) ERR-INSUFFICIENT-BALANCE)
        (asserts! (>= new-amount MIN-DELEGATION-AMOUNT) ERR-INSUFFICIENT-BALANCE)
        
        ;; Update delegation record
        (map-set delegations delegator (merge delegation-info {
            amount: new-amount
        }))
        
        ;; Update delegate's power (add difference)
        (map-set delegate-power delegate (merge delegate-info {
            total-received: (if (> new-amount current-amount)
                (+ (get total-received delegate-info) (- new-amount current-amount))
                (- (get total-received delegate-info) (- current-amount new-amount))
            ),
            last-update: stacks-block-height
        }))
        
        ;; Update individual tracking
        (map-set delegate-delegators {delegate: delegate, delegator: delegator} {
            amount: new-amount,
            delegation-time: stacks-block-height
        })
        
        ;; Record in history
        (map-set delegation-history history-id {
            delegator: delegator,
            delegate: delegate,
            amount: new-amount,
            action: "update",
            block-height: stacks-block-height
        })
        
        ;; Update total delegated power
        (var-set delegation-counter history-id)
        (if (> new-amount current-amount)
            (var-set total-delegated-power (+ (var-get total-delegated-power) (- new-amount current-amount)))
            (var-set total-delegated-power (- (var-get total-delegated-power) (- current-amount new-amount)))
        )
        
        (ok {
            delegator: delegator,
            delegate: delegate,
            previous-amount: current-amount,
            new-amount: new-amount
        })
    )
)

;; ============================================
;; Admin Functions
;; ============================================

;; Pause all delegation operations
(define-public (pause-delegation)
    (begin
        (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
        (var-set delegation-paused true)
        (ok true)
    )
)

;; Unpause delegation operations
(define-public (unpause-delegation)
    (begin
        (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
        (var-set delegation-paused false)
        (ok true)
    )
)

;; Emergency revoke delegation (admin only, for security purposes)
(define-public (admin-revoke-delegation (delegator principal))
    (let (
        (delegation-info (unwrap! (map-get? delegations delegator) ERR-NOT-DELEGATED))
        (delegate (get delegate delegation-info))
        (amount (get amount delegation-info))
        (delegate-info (get-delegate-power delegate))
        (history-id (+ (var-get delegation-counter) u1))
    )
        (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
        
        ;; Remove delegation record
        (map-delete delegations delegator)
        
        ;; Update delegate's received power
        (map-set delegate-power delegate {
            total-received: (- (get total-received delegate-info) amount),
            delegator-count: (- (get delegator-count delegate-info) u1),
            first-delegation: (get first-delegation delegate-info),
            last-update: stacks-block-height
        })
        
        ;; Remove individual delegation tracking
        (map-delete delegate-delegators {delegate: delegate, delegator: delegator})
        
        ;; Record in history
        (map-set delegation-history history-id {
            delegator: delegator,
            delegate: delegate,
            amount: amount,
            action: "admin-revoke",
            block-height: stacks-block-height
        })
        
        ;; Update counters
        (var-set delegation-counter history-id)
        (var-set total-delegated-power (- (var-get total-delegated-power) amount))
        
        (ok {
            delegator: delegator,
            delegate: delegate,
            amount-returned: amount,
            revoked-by: tx-sender
        })
    )
)
