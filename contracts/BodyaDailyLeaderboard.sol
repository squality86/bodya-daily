// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BodyaDailyLeaderboard {
    uint256 public constant MAX_SCORE = 600;

    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 indexed gameId,
        uint256 indexed dayId
    );

    mapping(address => mapping(uint256 => uint256)) public bestScoreByDay;

    function submitScore(uint256 score, uint256 gameId, uint256 dayId) external {
        require(score > 0 && score <= MAX_SCORE, "Invalid score");

        uint256 previous = bestScoreByDay[msg.sender][dayId];
        if (score > previous) {
            bestScoreByDay[msg.sender][dayId] = score;
        }

        emit ScoreSubmitted(msg.sender, score, gameId, dayId);
    }
}
