;; Research Funding DAO - Proposal Contract
;; Manages research proposal lifecycle and metadata

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-UNAUTHORIZED (err u400))
(define-constant ERR-PROPOSAL-NOT-FOUND (err u401))
(define-constant ERR-INVALID-PROPOSAL (err u402))
(define-constant ERR-PROPOSAL-ALREADY-EXISTS (err u403))
(define-constant ERR-INVALID-RESEARCHER (err u404))

;; Proposal limits
(define-constant MAX-TITLE-LENGTH u100)
(define-constant MAX-ABSTRACT-LENGTH u500)
(define-constant MAX-FUNDING-AMOUNT u100000000000) ;; 1000 sBTC in satoshis
(define-constant MIN-FUNDING-AMOUNT u100000000) ;; 1 sBTC in satoshis
(define-constant MAX-MILESTONES u10)

;; Data Variables
(define-data-var proposal-counter uint u0)
(define-data-var proposals-paused bool false)

;; Data Maps
(define-map detailed-proposals uint {
  researcher: principal,
  title: (string-ascii 100),
  abstract: (string-ascii 500),
  methodology-hash: (buff 32),
  budget-breakdown-hash: (buff 32),
  total-budget: uint,
  milestone-count: uint,
  estimated-duration: uint,
  research-category: (string-ascii 50),
  submission-time: uint,
  last-updated: uint,
  status: (string-ascii 20),
  ipfs-hash: (optional (string-ascii 64))
})

(define-map proposal-milestones {proposal-id: uint, milestone-id: uint} {
  title: (string-ascii 100),
  description: (string-ascii 200),
  funding-percentage: uint,
  estimated-completion: uint,
  deliverables: (string-ascii 300),
  success-criteria: (string-ascii 200)
})

(define-map researcher-profiles principal {
  name: (string-ascii 100),
  institution: (string-ascii 100),
  credentials-hash: (buff 32),
  verification-status: (string-ascii 20),
  total-proposals: uint,
  successful-projects: uint,
  reputation-score: uint,
  registration-time: uint
})

(define-map proposal-reviews {proposal-id: uint, reviewer: principal} {
  technical-score: uint,
  feasibility-score: uint,
  impact-score: uint,
  budget-score: uint,
  overall-score: uint,
  comments-hash: (buff 32),
  review-time: uint
})

;; Read-only functions
(define-read-only (get-proposal (proposal-id uint))
  (map-get? detailed-proposals proposal-id)
)

(define-read-only (get-proposal-milestone (proposal-id uint) (milestone-id uint))
  (map-get? proposal-milestones {proposal-id: proposal-id, milestone-id: milestone-id})
)

(define-read-only (get-researcher-profile (researcher principal))
  (map-get? researcher-profiles researcher)
)

(define-read-only (get-proposal-review (proposal-id uint) (reviewer principal))
  (map-get? proposal-reviews {proposal-id: proposal-id, reviewer: reviewer})
)

(define-read-only (get-total-proposals)
  (var-get proposal-counter)
)

(define-read-only (is-verified-researcher (researcher principal))
  (match (map-get? researcher-profiles researcher)
    profile-data (is-eq (get verification-status profile-data) "verified")
    false
  )
)

(define-read-only (calculate-proposal-score (proposal-id uint))
  ;; This would calculate average scores from all reviews
  ;; For now, returning a placeholder
  (some {
    proposal-id: proposal-id,
    average-score: u75,
    review-count: u3,
    technical-avg: u80,
    feasibility-avg: u70,
    impact-avg: u85,
    budget-avg: u65
  })
)

;; Public functions
(define-public (register-researcher 
  (name (string-ascii 100))
  (institution (string-ascii 100))
  (credentials-hash (buff 32))
)
  (let (
    (existing-profile (map-get? researcher-profiles tx-sender))
  )
    (asserts! (is-none existing-profile) ERR-PROPOSAL-ALREADY-EXISTS)
    (asserts! (not (var-get proposals-paused)) ERR-UNAUTHORIZED)
    
    (map-set researcher-profiles tx-sender {
      name: name,
      institution: institution,
      credentials-hash: credentials-hash,
      verification-status: "pending",
      total-proposals: u0,
      successful-projects: u0,
      reputation-score: u50, ;; Starting reputation
      registration-time: stacks-block-height
    })
    
    (ok tx-sender)
  )
)

(define-public (verify-researcher (researcher principal))
  (let (
    (profile-data (unwrap! (map-get? researcher-profiles researcher) ERR-INVALID-RESEARCHER))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    
    (map-set researcher-profiles researcher (merge profile-data {
      verification-status: "verified"
    }))
    
    (ok researcher)
  )
)

(define-public (submit-detailed-proposal
  (title (string-ascii 100))
  (abstract (string-ascii 500))
  (methodology-hash (buff 32))
  (budget-breakdown-hash (buff 32))
  (total-budget uint)
  (milestone-count uint)
  (estimated-duration uint)
  (research-category (string-ascii 50))
  (ipfs-hash (optional (string-ascii 64)))
)
  (let (
    (proposal-id (+ (var-get proposal-counter) u1))
    (researcher-profile (unwrap! (map-get? researcher-profiles tx-sender) ERR-INVALID-RESEARCHER))
  )
    (asserts! (not (var-get proposals-paused)) ERR-UNAUTHORIZED)
    (asserts! (is-verified-researcher tx-sender) ERR-INVALID-RESEARCHER)
    (asserts! (and (>= total-budget MIN-FUNDING-AMOUNT) (<= total-budget MAX-FUNDING-AMOUNT)) ERR-INVALID-PROPOSAL)
    (asserts! (and (> milestone-count u0) (<= milestone-count MAX-MILESTONES)) ERR-INVALID-PROPOSAL)
    (asserts! (> estimated-duration u0) ERR-INVALID-PROPOSAL)
    
    ;; Create detailed proposal
    (map-set detailed-proposals proposal-id {
      researcher: tx-sender,
      title: title,
      abstract: abstract,
      methodology-hash: methodology-hash,
      budget-breakdown-hash: budget-breakdown-hash,
      total-budget: total-budget,
      milestone-count: milestone-count,
      estimated-duration: estimated-duration,
      research-category: research-category,
      submission-time: stacks-block-height,
      last-updated: stacks-block-height,
      status: "submitted",
      ipfs-hash: ipfs-hash
    })
    
    ;; Update researcher profile
    (map-set researcher-profiles tx-sender (merge researcher-profile {
      total-proposals: (+ (get total-proposals researcher-profile) u1)
    }))
    
    (var-set proposal-counter proposal-id)
    
    ;; Submit to governance contract for voting
    (match (contract-call? .governance submit-research-proposal 
      title abstract methodology-hash total-budget milestone-count)
      success-result (ok {
        proposal-id: proposal-id,
        governance-proposal-id: success-result,
        status: "submitted"
      })
      error-code (begin
        ;; Rollback proposal creation if governance submission fails
        (map-delete detailed-proposals proposal-id)
        (var-set proposal-counter (- proposal-id u1))
        (err error-code)
      )
    )
  )
)

(define-public (add-proposal-milestone
  (proposal-id uint)
  (milestone-id uint)
  (title (string-ascii 100))
  (description (string-ascii 200))
  (funding-percentage uint)
  (estimated-completion uint)
  (deliverables (string-ascii 300))
  (success-criteria (string-ascii 200))
)
  (let (
    (proposal-data (unwrap! (map-get? detailed-proposals proposal-id) ERR-PROPOSAL-NOT-FOUND))
  )
    (asserts! (is-eq tx-sender (get researcher proposal-data)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status proposal-data) "submitted") ERR-INVALID-PROPOSAL)
    (asserts! (<= milestone-id (get milestone-count proposal-data)) ERR-INVALID-PROPOSAL)
    (asserts! (<= funding-percentage u100) ERR-INVALID-PROPOSAL)
    
    (map-set proposal-milestones {proposal-id: proposal-id, milestone-id: milestone-id} {
      title: title,
      description: description,
      funding-percentage: funding-percentage,
      estimated-completion: estimated-completion,
      deliverables: deliverables,
      success-criteria: success-criteria
    })
    
    (ok {
      proposal-id: proposal-id,
      milestone-id: milestone-id
    })
  )
)

(define-public (submit-proposal-review
  (proposal-id uint)
  (technical-score uint)
  (feasibility-score uint)
  (impact-score uint)
  (budget-score uint)
  (comments-hash (buff 32))
)
  (let (
    (proposal-data (unwrap! (map-get? detailed-proposals proposal-id) ERR-PROPOSAL-NOT-FOUND))
    (reviewer-power u1000) ;; Placeholder for testing
    (overall-score (/ (+ technical-score feasibility-score impact-score budget-score) u4))
  )
    (asserts! (> reviewer-power u0) ERR-UNAUTHORIZED)
    (asserts! (not (is-eq tx-sender (get researcher proposal-data))) ERR-UNAUTHORIZED)
    (asserts! (and (<= technical-score u100) (<= feasibility-score u100) 
                   (<= impact-score u100) (<= budget-score u100)) ERR-INVALID-PROPOSAL)
    
    (map-set proposal-reviews {proposal-id: proposal-id, reviewer: tx-sender} {
      technical-score: technical-score,
      feasibility-score: feasibility-score,
      impact-score: impact-score,
      budget-score: budget-score,
      overall-score: overall-score,
      comments-hash: comments-hash,
      review-time: stacks-block-height
    })
    
    (ok {
      proposal-id: proposal-id,
      reviewer: tx-sender,
      overall-score: overall-score
    })
  )
)

(define-public (update-proposal-status (proposal-id uint) (new-status (string-ascii 20)))
  (let (
    (proposal-data (unwrap! (map-get? detailed-proposals proposal-id) ERR-PROPOSAL-NOT-FOUND))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    
    (map-set detailed-proposals proposal-id (merge proposal-data {
      status: new-status,
      last-updated: stacks-block-height
    }))
    
    ;; If approved, log for milestone initialization
    (begin
      (if (is-eq new-status "approved")
        true ;; In production, would initialize milestones
        true
      )
      true
    )
    
    (ok {
      proposal-id: proposal-id,
      new-status: new-status
    })
  )
)

(define-public (update-researcher-reputation (researcher principal) (new-score uint))
  (let (
    (profile-data (unwrap! (map-get? researcher-profiles researcher) ERR-INVALID-RESEARCHER))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (asserts! (<= new-score u100) ERR-INVALID-PROPOSAL)
    
    (map-set researcher-profiles researcher (merge profile-data {
      reputation-score: new-score
    }))
    
    (ok {
      researcher: researcher,
      new-reputation: new-score
    })
  )
)

;; Admin functions
(define-public (pause-proposals)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (var-set proposals-paused true)
    (ok true)
  )
)

(define-public (unpause-proposals)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (var-set proposals-paused false)
    (ok true)
  )
)