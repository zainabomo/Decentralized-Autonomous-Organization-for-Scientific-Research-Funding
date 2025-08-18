;; Research Funding DAO - Governance Contract
;; Handles proposal voting and governance token operations

;; Treasury contract reference

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-INSUFFICIENT-VOTING-POWER (err u200))
(define-constant ERR-PROPOSAL-NOT-FOUND (err u201))
(define-constant ERR-VOTING-CLOSED (err u202))
(define-constant ERR-DUPLICATE-VOTE (err u203))
(define-constant ERR-UNAUTHORIZED (err u204))
(define-constant ERR-INVALID-PROPOSAL (err u205))

;; Voting parameters
(define-constant VOTING-PERIOD u1440) ;; 1440 blocks (~1 day)
(define-constant QUORUM-THRESHOLD u30) ;; 30% of total tokens
(define-constant APPROVAL-THRESHOLD u60) ;; 60% of votes cast

;; Data Variables
(define-data-var proposal-counter uint u0)
(define-data-var governance-paused bool false)

;; Data Maps
(define-map proposals uint {
  proposer: principal,
  title: (string-ascii 100),
  description: (string-ascii 500),
  proposal-type: (string-ascii 20),
  target-contract: (optional principal),
  voting-start: uint,
  voting-end: uint,
  votes-for: uint,
  votes-against: uint,
  total-votes: uint,
  status: (string-ascii 20),
  execution-delay: uint
})

(define-map votes {proposal-id: uint, voter: principal} {
  vote: bool,
  voting-power: uint,
  block-height: uint
})

(define-map research-proposals uint {
  researcher: principal,
  title: (string-ascii 100),
  abstract: (string-ascii 500),
  methodology-hash: (buff 32),
  total-budget: uint,
  milestone-count: uint,
  submission-time: uint,
  voting-end-time: uint,
  votes-for: uint,
  votes-against: uint,
  status: (string-ascii 20)
})

;; Read-only functions
(define-read-only (get-proposal (proposal-id uint))
  (map-get? proposals proposal-id)
)

(define-read-only (get-research-proposal (proposal-id uint))
  (map-get? research-proposals proposal-id)
)

(define-read-only (get-vote (proposal-id uint) (voter principal))
  (map-get? votes {proposal-id: proposal-id, voter: voter})
)

(define-read-only (get-voting-power (voter principal))
  ;; For testing purposes, return a default voting power
  ;; In production, this would integrate with treasury contract
  u1000
)

(define-read-only (is-voting-active (proposal-id uint))
  (match (map-get? proposals proposal-id)
    proposal-data (and 
      (>= stacks-block-height (get voting-start proposal-data))
      (<= stacks-block-height (get voting-end proposal-data))
      (is-eq (get status proposal-data) "active")
    )
    false
  )
)

(define-read-only (calculate-quorum-met (proposal-id uint))
  (match (map-get? proposals proposal-id)
    proposal-data (let (
      (total-governance-tokens u10000) ;; Placeholder for testing
      (total-votes (get total-votes proposal-data))
      (required-quorum (/ (* total-governance-tokens QUORUM-THRESHOLD) u100))
    )
      (>= total-votes required-quorum)
    )
    false
  )
)

;; Public functions
(define-public (create-governance-proposal 
  (title (string-ascii 100))
  (description (string-ascii 500))
  (proposal-type (string-ascii 20))
  (target-contract (optional principal))
  (execution-delay uint)
)
  (let (
    (proposal-id (+ (var-get proposal-counter) u1))
    (voting-start stacks-block-height)
    (voting-end (+ stacks-block-height VOTING-PERIOD))
  )
    (asserts! (not (var-get governance-paused)) ERR-UNAUTHORIZED)
    (asserts! (> (get-voting-power tx-sender) u0) ERR-INSUFFICIENT-VOTING-POWER)
    
    (map-set proposals proposal-id {
      proposer: tx-sender,
      title: title,
      description: description,
      proposal-type: proposal-type,
      target-contract: target-contract,
      voting-start: voting-start,
      voting-end: voting-end,
      votes-for: u0,
      votes-against: u0,
      total-votes: u0,
      status: "active",
      execution-delay: execution-delay
    })
    
    (var-set proposal-counter proposal-id)
    (ok proposal-id)
  )
)

(define-public (submit-research-proposal
  (title (string-ascii 100))
  (abstract (string-ascii 500))
  (methodology-hash (buff 32))
  (total-budget uint)
  (milestone-count uint)
)
  (let (
    (proposal-id (+ (var-get proposal-counter) u1))
    (voting-end-time (+ stacks-block-height VOTING-PERIOD))
  )
    (asserts! (not (var-get governance-paused)) ERR-UNAUTHORIZED)
    (asserts! (> total-budget u0) ERR-INVALID-PROPOSAL)
    (asserts! (> milestone-count u0) ERR-INVALID-PROPOSAL)
    
    (map-set research-proposals proposal-id {
      researcher: tx-sender,
      title: title,
      abstract: abstract,
      methodology-hash: methodology-hash,
      total-budget: total-budget,
      milestone-count: milestone-count,
      submission-time: stacks-block-height,
      voting-end-time: voting-end-time,
      votes-for: u0,
      votes-against: u0,
      status: "voting"
    })
    
    (var-set proposal-counter proposal-id)
    (ok proposal-id)
  )
)

(define-public (vote-on-proposal (proposal-id uint) (vote bool))
  (let (
    (voter-power (get-voting-power tx-sender))
    (existing-vote (map-get? votes {proposal-id: proposal-id, voter: tx-sender}))
  )
    (asserts! (> voter-power u0) ERR-INSUFFICIENT-VOTING-POWER)
    (asserts! (is-none existing-vote) ERR-DUPLICATE-VOTE)
    (asserts! (is-voting-active proposal-id) ERR-VOTING-CLOSED)
    
    ;; Record the vote
    (map-set votes {proposal-id: proposal-id, voter: tx-sender} {
      vote: vote,
      voting-power: voter-power,
      block-height: stacks-block-height
    })
    
    ;; Update proposal vote counts
    (match (map-get? proposals proposal-id)
      proposal-data (let (
        (new-votes-for (if vote (+ (get votes-for proposal-data) voter-power) (get votes-for proposal-data)))
        (new-votes-against (if vote (get votes-against proposal-data) (+ (get votes-against proposal-data) voter-power)))
        (new-total-votes (+ (get total-votes proposal-data) voter-power))
      )
        (map-set proposals proposal-id (merge proposal-data {
          votes-for: new-votes-for,
          votes-against: new-votes-against,
          total-votes: new-total-votes
        }))
        (ok {
          proposal-id: proposal-id,
          vote: vote,
          voting-power: voter-power
        })
      )
      ERR-PROPOSAL-NOT-FOUND
    )
  )
)

(define-public (vote-on-research-proposal (proposal-id uint) (vote bool))
  (let (
    (voter-power (get-voting-power tx-sender))
    (existing-vote (map-get? votes {proposal-id: proposal-id, voter: tx-sender}))
  )
    (asserts! (> voter-power u0) ERR-INSUFFICIENT-VOTING-POWER)
    (asserts! (is-none existing-vote) ERR-DUPLICATE-VOTE)
    
    ;; Check if voting is still active for research proposal
    (match (map-get? research-proposals proposal-id)
      research-data (begin
        (asserts! (<= stacks-block-height (get voting-end-time research-data)) ERR-VOTING-CLOSED)
        (asserts! (is-eq (get status research-data) "voting") ERR-VOTING-CLOSED)
        
        ;; Record the vote
        (map-set votes {proposal-id: proposal-id, voter: tx-sender} {
          vote: vote,
          voting-power: voter-power,
          block-height: stacks-block-height
        })
        
        ;; Update research proposal vote counts
        (let (
          (new-votes-for (if vote (+ (get votes-for research-data) voter-power) (get votes-for research-data)))
          (new-votes-against (if vote (get votes-against research-data) (+ (get votes-against research-data) voter-power)))
        )
          (map-set research-proposals proposal-id (merge research-data {
            votes-for: new-votes-for,
            votes-against: new-votes-against
          }))
          (ok {
            proposal-id: proposal-id,
            vote: vote,
            voting-power: voter-power
          })
        )
      )
      ERR-PROPOSAL-NOT-FOUND
    )
  )
)

(define-public (finalize-proposal (proposal-id uint))
  (match (map-get? proposals proposal-id)
    proposal-data (let (
      (votes-for (get votes-for proposal-data))
      (votes-against (get votes-against proposal-data))
      (total-votes (get total-votes proposal-data))
      (approval-votes-needed (/ (* total-votes APPROVAL-THRESHOLD) u100))
      (quorum-met (calculate-quorum-met proposal-id))
    )
      (asserts! (> stacks-block-height (get voting-end proposal-data)) ERR-VOTING-CLOSED)
      (asserts! (is-eq (get status proposal-data) "active") ERR-INVALID-PROPOSAL)
      
      (let (
        (new-status (if (and quorum-met (>= votes-for approval-votes-needed)) "approved" "rejected"))
      )
        (map-set proposals proposal-id (merge proposal-data {status: new-status}))
        (ok {
          proposal-id: proposal-id,
          status: new-status,
          votes-for: votes-for,
          votes-against: votes-against,
          quorum-met: quorum-met
        })
      )
    )
    ERR-PROPOSAL-NOT-FOUND
  )
)

(define-public (finalize-research-proposal (proposal-id uint))
  (match (map-get? research-proposals proposal-id)
    research-data (let (
      (votes-for (get votes-for research-data))
      (votes-against (get votes-against research-data))
      (total-votes (+ votes-for votes-against))
      (approval-votes-needed (/ (* total-votes APPROVAL-THRESHOLD) u100))
    )
      (asserts! (> stacks-block-height (get voting-end-time research-data)) ERR-VOTING-CLOSED)
      (asserts! (is-eq (get status research-data) "voting") ERR-INVALID-PROPOSAL)
      
      (let (
        (new-status (if (>= votes-for approval-votes-needed) "approved" "rejected"))
      )
        (map-set research-proposals proposal-id (merge research-data {status: new-status}))
        
        ;; If approved, log for treasury integration
        (if (is-eq new-status "approved")
          true ;; In production, would call treasury contract
          true
        )
        
        (ok {
          proposal-id: proposal-id,
          status: new-status,
          votes-for: votes-for,
          votes-against: votes-against
        })
      )
    )
    ERR-PROPOSAL-NOT-FOUND
  )
)

;; Admin functions
(define-public (pause-governance)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (var-set governance-paused true)
    (ok true)
  )
)

(define-public (unpause-governance)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (var-set governance-paused false)
    (ok true)
  )
)