;; Research Funding DAO - Treasury Contract
;; Manages sBTC deposits, governance token minting, and fund distribution

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-INSUFFICIENT-FUNDS (err u100))
(define-constant ERR-UNAUTHORIZED (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-PROPOSAL-NOT-FOUND (err u103))

;; Token ratio: 1 sBTC = 1000 governance tokens
(define-constant GOVERNANCE-TOKEN-RATIO u1000)
(define-constant MINIMUM-CONTRIBUTION u1000000) ;; 0.01 sBTC in satoshis

;; Data Variables
(define-data-var treasury-balance uint u0)
(define-data-var total-governance-tokens uint u0)
(define-data-var contribution-counter uint u0)

;; Data Maps
(define-map governance-token-balances principal uint)
(define-map contribution-history uint {
  contributor: principal,
  amount: uint,
  tokens-received: uint,
  block-height: uint
})

(define-map approved-proposals uint {
  researcher: principal,
  total-budget: uint,
  released-amount: uint,
  status: (string-ascii 20)
})

;; Read-only functions
(define-read-only (get-treasury-balance)
  (var-get treasury-balance)
)

(define-read-only (get-governance-token-balance (holder principal))
  (default-to u0 (map-get? governance-token-balances holder))
)

(define-read-only (get-total-governance-tokens)
  (var-get total-governance-tokens)
)

(define-read-only (calculate-governance-tokens (sbtc-amount uint))
  (/ (* sbtc-amount GOVERNANCE-TOKEN-RATIO) u100000000) ;; Convert from satoshis
)

(define-read-only (get-contribution-history (contribution-id uint))
  (map-get? contribution-history contribution-id)
)

(define-read-only (get-approved-proposal (proposal-id uint))
  (map-get? approved-proposals proposal-id)
)

;; Public functions
(define-public (contribute-sbtc (amount uint))
  (let (
    (current-balance (var-get treasury-balance))
    (current-tokens (var-get total-governance-tokens))
    (contributor-tokens (get-governance-token-balance tx-sender))
    (new-tokens (calculate-governance-tokens amount))
    (contribution-id (+ (var-get contribution-counter) u1))
  )
    (asserts! (>= amount MINIMUM-CONTRIBUTION) ERR-INVALID-AMOUNT)
    (asserts! (> new-tokens u0) ERR-INVALID-AMOUNT)
    
    ;; Update treasury balance
    (var-set treasury-balance (+ current-balance amount))
    
    ;; Update governance token balances
    (var-set total-governance-tokens (+ current-tokens new-tokens))
    (map-set governance-token-balances tx-sender (+ contributor-tokens new-tokens))
    
    ;; Record contribution history
    (map-set contribution-history contribution-id {
      contributor: tx-sender,
      amount: amount,
      tokens-received: new-tokens,
      block-height: stacks-block-height
    })
    (var-set contribution-counter contribution-id)
    
    (ok {
      tokens-received: new-tokens,
      new-balance: (+ contributor-tokens new-tokens),
      contribution-id: contribution-id
    })
  )
)

(define-public (approve-proposal (proposal-id uint) (researcher principal) (total-budget uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (asserts! (<= total-budget (var-get treasury-balance)) ERR-INSUFFICIENT-FUNDS)
    
    (map-set approved-proposals proposal-id {
      researcher: researcher,
      total-budget: total-budget,
      released-amount: u0,
      status: "approved"
    })
    
    (ok proposal-id)
  )
)

(define-public (release-funding (proposal-id uint) (amount uint))
  (let (
    (proposal-data (unwrap! (map-get? approved-proposals proposal-id) ERR-PROPOSAL-NOT-FOUND))
    (current-balance (var-get treasury-balance))
    (released-amount (get released-amount proposal-data))
    (total-budget (get total-budget proposal-data))
    (researcher (get researcher proposal-data))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (asserts! (>= current-balance amount) ERR-INSUFFICIENT-FUNDS)
    (asserts! (<= (+ released-amount amount) total-budget) ERR-INVALID-AMOUNT)
    
    ;; Update treasury balance
    (var-set treasury-balance (- current-balance amount))
    
    ;; Update proposal released amount
    (map-set approved-proposals proposal-id (merge proposal-data {
      released-amount: (+ released-amount amount)
    }))
    
    (ok {
      proposal-id: proposal-id,
      amount-released: amount,
      total-released: (+ released-amount amount),
      remaining-budget: (- total-budget (+ released-amount amount))
    })
  )
)

(define-public (transfer-governance-tokens (recipient principal) (amount uint))
  (let (
    (sender-balance (get-governance-token-balance tx-sender))
    (recipient-balance (get-governance-token-balance recipient))
  )
    (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-FUNDS)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    
    (map-set governance-token-balances tx-sender (- sender-balance amount))
    (map-set governance-token-balances recipient (+ recipient-balance amount))
    
    (ok {
      from: tx-sender,
      to: recipient,
      amount: amount
    })
  )
)

;; Emergency functions (only contract owner)
(define-public (emergency-pause)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    ;; In a real implementation, this would set a pause flag
    (ok true)
  )
)

(define-public (update-minimum-contribution (new-minimum uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    ;; In a real implementation, this would update the minimum contribution
    (ok new-minimum)
  )
)