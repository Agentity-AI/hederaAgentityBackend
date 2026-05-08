// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ERC8004AgentRegistry
 * @dev AI Agent Identity & Provenance Standard Implementation
 * 
 * This contract allows:
 * - Registering AI agents with capabilities
 * - Logging every action an agent takes
 * - Auditing agent behavior
 * - Flagging malicious actions
 */

contract ERC8004AgentRegistry {
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    struct Agent {
        uint256 id;
        string name;
        string version;
        address creator;
        string[] capabilities;      // What the agent is allowed to do
        uint256 actionCount;
        uint256 registeredAt;
        bool active;
    }
    
    struct Action {
        uint256 id;
        uint256 agentId;
        string actionType;          // e.g., "trade", "query_data", "send_email"
        bytes actionData;           // Encoded inputs
        bytes32 resultHash;         // Hash of the output (for verification)
        uint256 timestamp;
        bool flagged;
        string flagReason;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════
    
    uint256 private nextAgentId = 1;
    uint256 private nextActionId = 1;
    
    mapping(uint256 => Agent) public agents;              // agentId → Agent
    mapping(uint256 => Action[]) public agentActions;     // agentId → Action[]
    mapping(uint256 => Action) public actions;            // actionId → Action
    
    mapping(address => uint256[]) public creatorAgents;   // creator → agentIds[]
    
    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    event AgentRegistered(
        uint256 indexed agentId,
        string name,
        address indexed creator
    );
    
    event ActionLogged(
        uint256 indexed actionId,
        uint256 indexed agentId,
        string actionType,
        uint256 timestamp
    );
    
    event ActionFlagged(
        uint256 indexed actionId,
        uint256 indexed agentId,
        string reason,
        address indexed flagger
    );
    
    event CapabilitiesUpdated(
        uint256 indexed agentId,
        string[] newCapabilities
    );
    
    event AgentDeactivated(
        uint256 indexed agentId,
        address indexed deactivator
    );
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════
    
    modifier onlyAgentCreator(uint256 agentId) {
        require(agents[agentId].creator == msg.sender, "Not agent creator");
        _;
    }
    
    modifier agentExists(uint256 agentId) {
        require(agentId > 0 && agentId < nextAgentId, "Agent does not exist");
        _;
    }
    
    modifier agentActive(uint256 agentId) {
        require(agents[agentId].active, "Agent is not active");
        _;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @dev Register a new AI agent
     * @param name Agent name (e.g., "TradingBot-Alpha")
     * @param version Version string (e.g., "1.0.0")
     * @param capabilities Array of allowed actions (e.g., ["trade", "query_price"])
     * @return agentId The unique ID of the registered agent
     */
    function registerAgent(
        string memory name,
        string memory version,
        string[] memory capabilities
    ) external returns (uint256) {
        uint256 agentId = nextAgentId++;
        
        Agent storage agent = agents[agentId];
        agent.id = agentId;
        agent.name = name;
        agent.version = version;
        agent.creator = msg.sender;
        agent.capabilities = capabilities;
        agent.actionCount = 0;
        agent.registeredAt = block.timestamp;
        agent.active = true;
        
        creatorAgents[msg.sender].push(agentId);
        
        emit AgentRegistered(agentId, name, msg.sender);
        
        return agentId;
    }
    
    /**
     * @dev Log an action performed by an agent
     * @param agentId The agent's ID
     * @param actionType Type of action (e.g., "execute_trade", "read_file")
     * @param actionData Encoded action inputs (ABI encoded or JSON string as bytes)
     * @param resultHash Keccak256 hash of the action result (for verification)
     * @return actionId The unique ID of this action
     */
    function logAction(
        uint256 agentId,
        string memory actionType,
        bytes memory actionData,
        bytes32 resultHash
    )
        external
        agentExists(agentId)
        agentActive(agentId)
        onlyAgentCreator(agentId)
        returns (uint256)
    {
        uint256 actionId = nextActionId++;
        
        Action memory action = Action({
            id: actionId,
            agentId: agentId,
            actionType: actionType,
            actionData: actionData,
            resultHash: resultHash,
            timestamp: block.timestamp,
            flagged: false,
            flagReason: ""
        });
        
        actions[actionId] = action;
        agentActions[agentId].push(action);
        agents[agentId].actionCount++;
        
        emit ActionLogged(actionId, agentId, actionType, block.timestamp);
        
        return actionId;
    }
    
    /**
     * @dev Flag an action as potentially malicious
     * @param actionId The action to flag
     * @param reason Human-readable explanation
     */
    function flagAction(uint256 actionId, string memory reason) external {
        require(actionId > 0 && actionId < nextActionId, "Action does not exist");
        
        Action storage action = actions[actionId];
        action.flagged = true;
        action.flagReason = reason;
        
        emit ActionFlagged(actionId, action.agentId, reason, msg.sender);
    }
    
    /**
     * @dev Update an agent's capabilities (only creator can do this)
     * @param agentId The agent ID
     * @param newCapabilities New capability list
     */
    function updateCapabilities(
        uint256 agentId,
        string[] memory newCapabilities
    )
        external
        agentExists(agentId)
        onlyAgentCreator(agentId)
    {
        agents[agentId].capabilities = newCapabilities;
        emit CapabilitiesUpdated(agentId, newCapabilities);
    }
    
    /**
     * @dev Deactivate an agent (stops it from logging new actions)
     * @param agentId The agent to deactivate
     */
    function deactivateAgent(uint256 agentId)
        external
        agentExists(agentId)
        onlyAgentCreator(agentId)
    {
        agents[agentId].active = false;
        emit AgentDeactivated(agentId, msg.sender);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS (for auditing)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @dev Get full agent details
     */
    function getAgent(uint256 agentId)
        external
        view
        agentExists(agentId)
        returns (
            string memory name,
            string memory version,
            address creator,
            string[] memory capabilities,
            uint256 actionCount,
            uint256 registeredAt,
            bool active
        )
    {
        Agent memory agent = agents[agentId];
        return (
            agent.name,
            agent.version,
            agent.creator,
            agent.capabilities,
            agent.actionCount,
            agent.registeredAt,
            agent.active
        );
    }
    
    /**
     * @dev Get action history for an agent
     * @param agentId The agent ID
     * @param offset Starting index (for pagination)
     * @param limit Max number of actions to return
     */
    function getActions(
        uint256 agentId,
        uint256 offset,
        uint256 limit
    )
        external
        view
        agentExists(agentId)
        returns (Action[] memory)
    {
        Action[] storage allActions = agentActions[agentId];
        uint256 total = allActions.length;
        
        if (offset >= total) {
            return new Action[](0);
        }
        
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        
        uint256 count = end - offset;
        Action[] memory result = new Action[](count);
        
        for (uint256 i = 0; i < count; i++) {
            result[i] = allActions[offset + i];
        }
        
        return result;
    }
    
    /**
     * @dev Get all agents created by an address
     */
    function getCreatorAgents(address creator)
        external
        view
        returns (uint256[] memory)
    {
        return creatorAgents[creator];
    }
    
    /**
     * @dev Get total number of registered agents
     */
    function getTotalAgents() external view returns (uint256) {
        return nextAgentId - 1;
    }
    
    /**
     * @dev Check if an agent has a specific capability
     */
    function hasCapability(uint256 agentId, string memory capability)
        external
        view
        agentExists(agentId)
        returns (bool)
    {
        string[] memory caps = agents[agentId].capabilities;
        for (uint256 i = 0; i < caps.length; i++) {
            if (keccak256(bytes(caps[i])) == keccak256(bytes(capability))) {
                return true;
            }
        }
        return false;
    }
}
